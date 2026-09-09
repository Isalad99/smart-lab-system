# ใช้ Python 3.11 เป็นฐาน
FROM python:3.11-slim

# ติดตั้งเฉพาะ shared libraries ที่ใช้ตอนรัน OpenCV/TensorFlow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# จำกัดจำนวน thread ให้เหมาะกับ Server ขนาดเล็กและลดการแย่ง CPU กับ API
ENV OMP_NUM_THREADS=2
ENV OPENBLAS_NUM_THREADS=2
ENV MKL_NUM_THREADS=2
ENV TF_NUM_INTRAOP_THREADS=2
ENV TF_NUM_INTEROP_THREADS=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# คัดลอกและติดตั้งไลบรารีทั้งหมด
COPY requirements.txt .
RUN pip install --no-cache-dir --disable-pip-version-check -r requirements.txt

# คัดลอกโค้ดทั้งหมดลงในกล่อง
COPY . .

# Hugging Face บังคับให้เซิร์ฟเวอร์ต้องรันบนพอร์ต 7860
EXPOSE 7860

# คำสั่งเปิดเซิร์ฟเวอร์ FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
