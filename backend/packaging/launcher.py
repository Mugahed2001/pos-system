import os
import sys
from pathlib import Path


def load_env_file(env_path: Path) -> bool:
    if not env_path.exists():
        return False
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()
            if (value.startswith('"') and value.endswith('"')) or (
                value.startswith("'") and value.endswith("'")
            ):
                value = value[1:-1]
            if key:
                # In packaged installs the .env should be authoritative, even if
                # the machine has generic DB_* variables defined.
                os.environ[key] = value
        return True
    except Exception:
        return False


def log(message: str) -> None:
    print(message, flush=True)


def main():
    if getattr(sys, "frozen", False):
        base_dir = Path(sys.executable).resolve().parent
    else:
        base_dir = Path(__file__).resolve().parents[1]

    os.chdir(base_dir)
    os.environ.setdefault("PYTHONUNBUFFERED", "1")
    log(f"[launcher] Base directory: {base_dir}")

    env_override = os.environ.get("ENV_FILE", "").strip()
    candidate_paths = []

    if env_override:
        env_path = Path(env_override)
        if not env_path.is_absolute():
            env_path = base_dir / env_path
        candidate_paths = [env_path]
        log(f"[launcher] ENV_FILE override: {env_path}")
    else:
        program_data = os.environ.get("ProgramData") or os.environ.get("PROGRAMDATA")
        if program_data:
            candidate_paths.append(
                Path(program_data) / "POS System" / "backend" / ".env"
            )
        candidate_paths.append(base_dir / ".env")

    loaded = False
    env_path = None
    load_failed = False
    log("[launcher] Searching for .env...")
    for candidate in candidate_paths:
        if candidate and candidate.exists():
            env_path = candidate
            loaded = load_env_file(candidate)
            if loaded:
                break
            load_failed = True
        elif env_override:
            env_path = candidate

    if loaded and env_path:
        os.environ["ENV_FILE"] = str(env_path)
        log(f"[launcher] Loaded ENV_FILE: {env_path}")
        # Log resolved DB connection inputs (without secrets) to aid field debugging.
        db_engine = os.environ.get("DB_ENGINE", "")
        db_name = os.environ.get("DB_NAME", "")
        db_host = os.environ.get("DB_HOST", "")
        db_port = os.environ.get("DB_PORT", "")
        db_schema = os.environ.get("DB_SCHEMA", "")
        has_db_url = bool(os.environ.get("DATABASE_URL", "").strip())
        log(
            "[launcher] DB config: "
            f"ENGINE={db_engine!s} NAME={db_name!s} HOST={db_host!s} "
            f"PORT={db_port!s} SCHEMA={db_schema!s} DATABASE_URL={'set' if has_db_url else 'unset'}"
        )
    else:
        searched = "; ".join(str(path) for path in candidate_paths if path)
        if env_override and env_path:
            log(f"[launcher] ENV_FILE override not found: {env_path}")
        elif load_failed and env_path:
            log(f"[launcher] Failed to load ENV_FILE: {env_path}")
        else:
            log(f"[launcher] ENV_FILE not found. Searched: {searched}")
        sys.exit(2)

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    log("[launcher] DJANGO_SETTINGS_MODULE=config.settings")

    from django.core.management import execute_from_command_line

    if len(sys.argv) > 1:
        log(f"[launcher] Running management command: {' '.join(sys.argv[1:])}")
        execute_from_command_line(["manage.py", *sys.argv[1:]])
        return

    host = os.environ.get("API_HOST", "127.0.0.1")
    port = int(os.environ.get("API_PORT", "8000"))

    from config.wsgi import application
    from waitress import serve

    log(f"[launcher] Starting waitress on {host}:{port}")
    serve(application, host=host, port=port)


if __name__ == "__main__":
    main()
