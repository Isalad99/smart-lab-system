import os
from functools import lru_cache


FACE_MODEL_NAME = "Facenet"


@lru_cache(maxsize=1)
def get_deepface():
    """Load DeepFace lazily so normal API startup stays lightweight."""
    os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "2")
    os.environ.setdefault("TF_NUM_INTEROP_THREADS", "1")
    os.environ.setdefault("OMP_NUM_THREADS", "2")

    from deepface import DeepFace

    return DeepFace
