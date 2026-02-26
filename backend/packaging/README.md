Backend Packaging (Windows)

1) Create backend exe:
   - Run: powershell -ExecutionPolicy Bypass -File packaging\build_backend.ps1
   - Output: backend\dist\django_api.exe

2) Ensure backend environment file:
   - backend\.env.pos is copied to backend\dist\.env (optional default)

3) Run backend exe:
   - backend\dist\django_api.exe

4) Initialize database:
   - SQLite (default): backend\dist\django_api.exe migrate --noinput
   - PostgreSQL schema: powershell -ExecutionPolicy Bypass -File packaging\init_db.ps1
