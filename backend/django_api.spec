# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

hiddenimports = []
hiddenimports += collect_submodules('rest_framework')
hiddenimports += collect_submodules('corsheaders')
hiddenimports += collect_submodules('waitress')
hiddenimports += collect_submodules('core')

datas = [
    ('config', 'config'),
    ('core', 'core'),
    ('tenants', 'tenants'),
    ('security', 'security'),
    ('catalog', 'catalog'),
    ('inventory', 'inventory'),
    ('customers', 'customers'),
    ('taxes', 'taxes'),
    ('transactions', 'transactions'),
    ('accounting', 'accounting'),
    ('reporting', 'reporting'),
]
datas += collect_data_files('rest_framework')
datas += collect_data_files('corsheaders')

a = Analysis(
    ['packaging\\launcher.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='django_api',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
