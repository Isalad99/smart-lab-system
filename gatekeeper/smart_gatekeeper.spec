# smart_gatekeeper.spec
import os
import glob
import cv2
import torch
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

block_cipher = None

# Collect customtkinter assets
ctk_datas = collect_data_files("customtkinter")

# Include only the CPU torch runtime and its extension module. Collecting all
# torch submodules also pulls in training, TensorBoard, SciPy and other unused
# packages.
torch_binaries = collect_dynamic_libs('torch')
torch_root = os.path.dirname(torch.__file__)
torch_binaries += [
    (path, 'torch')
    for path in glob.glob(os.path.join(torch_root, '*.pyd'))
]

# cv2 haar cascade path
cv2_data = os.path.dirname(cv2.__file__)
model_root = 'Silent-Face-Anti-Spoofing'
runtime_data = [
    (os.path.join(model_root, 'src', 'anti_spoof_predict.py'), os.path.join(model_root, 'src')),
    (os.path.join(model_root, 'src', 'utility.py'), os.path.join(model_root, 'src')),
    (os.path.join(model_root, 'src', 'model_lib', 'MiniFASNet.py'), os.path.join(model_root, 'src', 'model_lib')),
    (os.path.join(model_root, 'src', 'data_io', 'transform.py'), os.path.join(model_root, 'src', 'data_io')),
    (os.path.join(model_root, 'src', 'data_io', 'functional.py'), os.path.join(model_root, 'src', 'data_io')),
    (os.path.join(model_root, 'resources', 'anti_spoof_models', '2.7_80x80_MiniFASNetV2.pth'), os.path.join(model_root, 'resources', 'anti_spoof_models')),
    (os.path.join(model_root, 'resources', 'detection_model', 'Widerface-RetinaFace.caffemodel'), os.path.join(model_root, 'resources', 'detection_model')),
    (os.path.join(model_root, 'resources', 'detection_model', 'deploy.prototxt'), os.path.join(model_root, 'resources', 'detection_model')),
]

a = Analysis(
    ['smart_gatekeeper.py'],
    pathex=['.', model_root],
    binaries=[
        *torch_binaries,
    ],
    datas=[
        *ctk_datas,
        (os.path.join(cv2_data, 'data', 'haarcascade_frontalface_default.xml'), os.path.join('cv2', 'data')),
        *runtime_data,
    ],
    hiddenimports=[
        'customtkinter',
        'PIL._tkinter_finder',
        'cv2',
        'torch',
        'torch._C',
        'torch.nn',
        'torch.nn.functional',
        'src.anti_spoof_predict',
        'src.utility',
        'src.model_lib.MiniFASNet',
        'src.data_io.transform',
        'src.data_io.functional',
    ],
    hookspath=['.'],
    hooksconfig={},
    runtime_hooks=['hook-torch.py'],
    excludes=[
        'torch._dynamo',
        'torch._export',
        'torch._functorch',
        'torch._inductor',
        'torch.contrib',
        'torch.distributed',
        'torch.testing',
        'torch.utils.benchmark',
        'torch.utils.data.datapipes',
        'torch.utils.tensorboard',
        'tensorboard',
        'tensorflow',
        'keras',
        'scipy',
        'pandas',
        'torchvision',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    exclude_binaries=False,
    name='SmartGatekeeper',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='NONE',
)
