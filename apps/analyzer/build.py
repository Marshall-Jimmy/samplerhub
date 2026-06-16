"""
PyInstaller 打包脚本
将 Python sidecar 打包为单个可执行文件

使用方法:
    python build.py

输出:
    dist/analyzer.exe (Windows) 或 dist/analyzer (macOS/Linux)
"""

import subprocess
import sys
import shutil
from pathlib import Path


def build():
    """使用 PyInstaller 打包 sidecar"""
    print('开始打包 Analyzer Sidecar...')

    # 检查 PyInstaller
    try:
        import PyInstaller
    except ImportError:
        print('正在安装 PyInstaller...')
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pyinstaller'])

    # 清理旧构建
    dist_dir = Path('dist')
    build_dir = Path('build')
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    if build_dir.exists():
        shutil.rmtree(build_dir)

    # PyInstaller 参数
    cmd = [
        sys.executable, '-m', 'PyInstaller',
        '--name', 'analyzer',
        '--onefile',           # 打包为单个文件
        '--noconsole',         # 无控制台窗口
        '--clean',
        '--noconfirm',
        # 隐藏导入
        '--hidden-import', 'analyzer.clap_engine',
        '--hidden-import', 'analyzer.audio_utils',
        '--hidden-import', 'laion_clap',
        '--hidden-import', 'librosa',
        '--hidden-import', 'soundfile',
        '--hidden-import', 'torch',
        '--hidden-import', 'torchaudio',
        '--hidden-import', 'transformers',
        '--hidden-import', 'numpy',
        '--hidden-import', 'fastapi',
        '--hidden-import', 'uvicorn',
        '--hidden-import', 'pydantic',
        'main.py',
    ]

    print(f'执行: {" ".join(cmd)}')
    subprocess.check_call(cmd)

    print(f'打包完成！输出: {dist_dir / "analyzer"}')
    print('请将 dist/analyzer 复制到 Electron 项目的 resources/analyzer/ 目录')


if __name__ == '__main__':
    build()
