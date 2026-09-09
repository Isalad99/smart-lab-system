import os
import sys
import time
import threading
import queue
import winsound
import cv2
import customtkinter as ctk
import requests
from PIL import Image

# Keep CPU inference predictable on the 8 GB scanning machine.
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")

# ── PyInstaller path fix ───────────────────────────────────────────────────────
def _base_path():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

BASE_DIR = _base_path()

# ── CONFIG ────────────────────────────────────────────────────────────────────
CONFIG = {
    "LIVENESS_THRESHOLD": 0.72,
    "CAMERA_INDEX":       0,
    "DISPLAY_SIZE":       (600, 450),
    "SPOOF_COOLDOWN_SEC": 3,
    "RESET_DELAY_MS":     3000,
    "DETECT_EVERY_N":     3,
}

API_URL = os.getenv(
    "SMART_LAB_API_URL",
    "https://h0sh1na-smart-lab-backend.hf.space",
).rstrip("/")
LAB_CODE = os.getenv("SMART_LAB_CODE", "LAB01")
GATEKEEPER_API_KEY = os.getenv("SMART_LAB_GATEKEEPER_KEY", "")

CLR = {
    "ready":    "#38bdf8",
    "granted":  "#10b981",
    "denied":   "#ef4444",
    "warning":  "#f59e0b",
    "panel_bg": "#1e293b",
    "dark_bg":  "#0f172a",
}

ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")


class GatekeeperDemo(ctk.CTk):

    def __init__(self):
        super().__init__()
        self.title("Smart Lab — AI Gatekeeper")
        self.geometry("1024x620")
        self.resizable(False, False)

        self.lift()
        self.focus_force()
        self.attributes('-topmost', True)
        self.after(500, lambda: self.attributes('-topmost', False))

        self.is_scanning    = False
        self.models_loaded  = False
        self.in_cooldown    = False
        self._cooldown_left = 0
        self._frame_count   = 0

        self._frame_queue   = queue.Queue(maxsize=1)
        self._detect_queue  = queue.Queue(maxsize=1)

        self._last_faces    = []
        self._last_frame_hw = (480, 640)

        # scan available cameras before building UI
        self._available_cameras = self._scan_cameras()
        self._current_cam_index = CONFIG["CAMERA_INDEX"]

        self._setup_ui()
        self._init_hardware()

    # ──────────────────────────────────────────────────────────────────────
    # UI
    # ──────────────────────────────────────────────────────────────────────

    def _scan_cameras(self) -> dict:
        """สแกนหา camera ที่ใช้งานได้ — คืน dict {index: label}"""
        found = {}
        for i in range(6):  # เช็ค index 0-5
            cap = cv2.VideoCapture(i)
            if cap.isOpened():
                found[i] = f"Camera {i}"
                cap.release()
        print(f"[Gatekeeper] found cameras: {found}")
        return found if found else {0: "Camera 0"}

    def _setup_ui(self):
        self._build_camera_panel()
        self._build_status_panel()

    def _build_camera_panel(self):
        cam = ctk.CTkFrame(self, corner_radius=15)
        cam.pack(side="left", padx=20, pady=20, fill="both", expand=True)
        self.video_label = ctk.CTkLabel(cam, text="กำลังเปิดกล้อง...")
        self.video_label.pack(expand=True, fill="both", padx=10, pady=10)

    def _build_status_panel(self):
        self.panel = ctk.CTkFrame(self, width=310, corner_radius=15, fg_color=CLR["panel_bg"])
        self.panel.pack(side="right", padx=(0, 20), pady=20, fill="y")
        self.panel.pack_propagate(False)

        ctk.CTkLabel(self.panel, text="🔐  LIVENESS CHECK", font=ctk.CTkFont(size=18, weight="bold")).pack(pady=(28, 8))

        status_box = ctk.CTkFrame(self.panel, fg_color=CLR["dark_bg"], corner_radius=12)
        status_box.pack(padx=20, pady=8, fill="x")
        self.status_label = ctk.CTkLabel(status_box, text="LOADING AI...", font=ctk.CTkFont(size=22, weight="bold"), text_color=CLR["warning"])
        self.status_label.pack(pady=22)

        self.sub_label = ctk.CTkLabel(self.panel, text="กรุณารอสักครู่...", font=ctk.CTkFont(size=13), text_color="#94a3b8")
        self.sub_label.pack(pady=(6, 2))

        self.score_badge = ctk.CTkLabel(self.panel, text="", font=ctk.CTkFont(size=12, weight="bold"), corner_radius=8)
        self.score_badge.pack(pady=4)

        self._build_score_bar()
        self._build_cooldown_box()

        # camera selector — แสดงเฉพาะเมื่อมีกล้องมากกว่า 1 ตัว
        if len(self._available_cameras) > 1:
            self._build_camera_selector()

        self._build_dev_buttons()

    def _build_camera_selector(self):
        """Dropdown สำหรับเลือกกล้อง"""
        cam_frame = ctk.CTkFrame(self.panel, fg_color="transparent")
        cam_frame.pack(padx=20, pady=(8, 0), fill="x")

        ctk.CTkLabel(
            cam_frame, text="📷  เลือกกล้อง",
            font=ctk.CTkFont(size=11), text_color="#475569",
        ).pack(anchor="w", pady=(0, 4))

        cam_labels = list(self._available_cameras.values())
        self._cam_var = ctk.StringVar(value=cam_labels[self._current_cam_index] if self._current_cam_index < len(cam_labels) else cam_labels[0])

        self._cam_dropdown = ctk.CTkOptionMenu(
            cam_frame,
            values=cam_labels,
            variable=self._cam_var,
            command=self._on_camera_change,
            fg_color="#0f172a",
            button_color="#334155",
            button_hover_color="#475569",
            font=ctk.CTkFont(size=12),
        )
        self._cam_dropdown.pack(fill="x")

    def _build_score_bar(self):
        bar_frame = ctk.CTkFrame(self.panel, fg_color="transparent")
        bar_frame.pack(padx=20, pady=(10, 4), fill="x")
        ctk.CTkLabel(bar_frame, text="Confidence", font=ctk.CTkFont(size=11), text_color="#475569").pack(anchor="w")
        self.score_bar = ctk.CTkProgressBar(bar_frame, height=14, corner_radius=7, progress_color=CLR["ready"])
        self.score_bar.set(0)
        self.score_bar.pack(fill="x", pady=(4, 0))
        self.score_pct_label = ctk.CTkLabel(bar_frame, text="—", font=ctk.CTkFont(size=11), text_color="#64748b")
        self.score_pct_label.pack(anchor="e")

    def _build_cooldown_box(self):
        self.cooldown_frame = ctk.CTkFrame(self.panel, fg_color="#1a0a0a", corner_radius=10)
        self.cooldown_label = ctk.CTkLabel(self.cooldown_frame, text="", font=ctk.CTkFont(size=14, weight="bold"), text_color=CLR["denied"])
        self.cooldown_label.pack(pady=14)

    def _build_dev_buttons(self):
        dev = ctk.CTkFrame(self.panel, fg_color="transparent")
        dev.pack(side="bottom", pady=20, fill="x")
        ctk.CTkLabel(dev, text="⚡  DEV MOCK", font=ctk.CTkFont(size=11), text_color="#334155").pack(pady=(0, 6))
        ctk.CTkButton(dev, text="Force: Real Face ✓",    fg_color=CLR["granted"], hover_color="#059669", font=ctk.CTkFont(size=13, weight="bold"), command=lambda: self._force_result(True)).pack(pady=3, padx=20, fill="x")
        ctk.CTkButton(dev, text="Force: Spoof / Fake ✗", fg_color=CLR["denied"],  hover_color="#dc2626", font=ctk.CTkFont(size=13, weight="bold"), command=lambda: self._force_result(False)).pack(pady=3, padx=20, fill="x")

    # ──────────────────────────────────────────────────────────────────────
    # HARDWARE + MODEL
    # ──────────────────────────────────────────────────────────────────────

    def _on_camera_change(self, selected_label: str):
        """เปลี่ยนกล้องแบบ hot-swap — release เก่า เปิดใหม่"""
        # หา index จาก label ที่เลือก
        new_index = next(
            (idx for idx, label in self._available_cameras.items() if label == selected_label),
            0
        )
        if new_index == self._current_cam_index:
            return

        print(f"[Gatekeeper] switching camera {self._current_cam_index} → {new_index}")
        self._current_cam_index = new_index

        # release กล้องเก่าแล้วเปิดใหม่ใน thread แยก
        def _switch():
            old_cap = self.cap
            new_cap = cv2.VideoCapture(new_index)
            new_cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
            new_cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            new_cap.set(cv2.CAP_PROP_FPS, 30)
            self.cap = new_cap
            old_cap.release()
            print(f"[Gatekeeper] camera {new_index} ready.")

        threading.Thread(target=_switch, daemon=True).start()

    def _init_hardware(self):
        self.cap = cv2.VideoCapture(self._current_cam_index)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.cap.set(cv2.CAP_PROP_FPS, 30)

        # Haar cascade path fix for PyInstaller
        haar_path = os.path.join(BASE_DIR, "cv2", "data", "haarcascade_frontalface_default.xml")
        if not os.path.exists(haar_path):
            haar_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        print(f"[DEBUG] haar_path   = {haar_path}")
        print(f"[DEBUG] haar exists = {os.path.exists(haar_path)}")
        self.detector = cv2.CascadeClassifier(haar_path)

        threading.Thread(target=self._capture_loop, daemon=True).start()
        threading.Thread(target=self._detect_loop,  daemon=True).start()
        threading.Thread(target=self._load_models,  daemon=True).start()

        self._display_loop()

    def _capture_loop(self):
        while True:
            ret, frame = self.cap.read()
            if not ret:
                time.sleep(0.05)
                continue
            frame = cv2.flip(frame, 1)
            try:
                self._frame_queue.put_nowait(frame)
            except queue.Full:
                try:
                    self._frame_queue.get_nowait()
                except queue.Empty:
                    pass
                self._frame_queue.put_nowait(frame)

    def _detect_loop(self):
        while True:
            frame = self._detect_queue.get()
            h, w  = frame.shape[:2]

            small   = cv2.resize(frame, (320, 240))
            scale_x = w / 320
            scale_y = h / 240
            gray    = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            faces   = self.detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(60, 60))

            scaled = []
            for (sx, sy, sw, sh) in faces:
                scaled.append((int(sx*scale_x), int(sy*scale_y), int(sw*scale_x), int(sh*scale_y)))

            self._last_faces    = scaled
            self._last_frame_hw = (h, w)

    def _load_models(self):
        try:
            repo_path  = os.path.join(BASE_DIR, "Silent-Face-Anti-Spoofing")
            model_file = os.path.join(repo_path, "resources", "anti_spoof_models", "2.7_80x80_MiniFASNetV2.pth")

            print(f"[DEBUG] BASE_DIR     = {BASE_DIR}")
            print(f"[DEBUG] repo_path    = {repo_path}")
            print(f"[DEBUG] repo exists  = {os.path.exists(repo_path)}")
            print(f"[DEBUG] model file   = {model_file}")
            print(f"[DEBUG] model exists = {os.path.exists(model_file)}")

            if not os.path.exists(repo_path):
                raise FileNotFoundError(f"Folder not found: {repo_path}")
            if not os.path.exists(model_file):
                raise FileNotFoundError(f"Model not found: {model_file}")

            sys.path.insert(0, repo_path)
            self.model_path = model_file

            try:
                import torch
                try:
                    torch_threads = max(1, int(os.getenv("SMART_GATEKEEPER_TORCH_THREADS", "2")))
                except ValueError:
                    torch_threads = 2
                torch.set_num_threads(torch_threads)
                try:
                    torch.set_num_interop_threads(1)
                except RuntimeError:
                    pass
                print(f"[DEBUG] torch OK, CUDA={torch.cuda.is_available()}")
            except Exception as te:
                print(f"[DEBUG] torch warning: {te}")

            from src.anti_spoof_predict import AntiSpoofPredict
            orig = os.getcwd()
            os.chdir(repo_path)
            self.anti_spoof = AntiSpoofPredict(device_id=None)
            os.chdir(orig)
            self.anti_spoof.load_model(self.model_path)

            print("[Gatekeeper] model loaded OK.")
            self.models_loaded = True
            self.after(0, self._reset_state)

        except Exception as e:
            print(f"[Gatekeeper] model load FAILED: {e}")
            err_msg = str(e)[:60]
            self.after(0, lambda msg=err_msg: self._set_status("MODEL ERROR", CLR["denied"], msg))

    # ──────────────────────────────────────────────────────────────────────
    # DISPLAY LOOP (main thread)
    # ──────────────────────────────────────────────────────────────────────

    def _display_loop(self):
        try:
            frame = self._frame_queue.get_nowait()
        except queue.Empty:
            self.after(30, self._display_loop)
            return

        h, w   = frame.shape[:2]
        cx, cy = w // 2, h // 2
        oval_a, oval_b = 110, 145

        cv2.ellipse(frame, (cx, cy), (oval_a, oval_b), 0, 0, 360, (80, 80, 80), 1)

        if self.models_loaded and not self.is_scanning and not self.in_cooldown:
            self._frame_count += 1

            if self._frame_count % CONFIG["DETECT_EVERY_N"] == 0:
                try:
                    self._detect_queue.put_nowait(frame.copy())
                except queue.Full:
                    pass

            faces = self._last_faces
            if len(faces) > 1:
                cv2.putText(frame, "กรุณาเข้าทีละคน", (w//2 - 120, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 80, 255), 2)
                self.after(0, lambda: self.sub_label.configure(text="⚠  กรุณาเข้าทีละคน"))

            elif len(faces) == 1:
                x, y, fw, fh = faces[0]
                pad  = 15
                x1   = max(0, x - pad);  y1 = max(0, y - pad)
                x2   = min(w, x+fw+pad); y2 = min(h, y+fh+pad)

                cv2.rectangle(frame, (x, y), (x+fw, y+fh), (255, 200, 0), 2)
                for px, py, dx, dy in [(x,y,1,1),(x+fw,y,-1,1),(x,y+fh,1,-1),(x+fw,y+fh,-1,-1)]:
                    cv2.line(frame, (px,py), (px+dx*18,py), (0,255,255), 3)
                    cv2.line(frame, (px,py), (px,py+dy*18), (0,255,255), 3)

                cv2.ellipse(frame, (cx,cy), (oval_a,oval_b), 0, 0, 360, (56,189,248), 2)

                crop = frame[y1:y2, x1:x2]
                if crop.size > 0:
                    self.is_scanning = True
                    self._last_faces  = []
                    self.after(0, lambda: self.status_label.configure(text="ANALYZING...", text_color=CLR["warning"]))
                    self.after(0, lambda: self.sub_label.configure(text="กำลังตรวจสอบ..."))
                    threading.Thread(
                        target=self._run_liveness,
                        args=(crop.copy(), frame.copy()),
                        daemon=True,
                    ).start()

        rgb   = cv2.cvtColor(frame, cv2.COLOR_BGR2RGBA)
        imgtk = ctk.CTkImage(light_image=Image.fromarray(rgb), dark_image=Image.fromarray(rgb), size=CONFIG["DISPLAY_SIZE"])
        self.video_label.configure(image=imgtk, text="")
        self.video_label.image = imgtk

        self.after(30, self._display_loop)

    # ──────────────────────────────────────────────────────────────────────
    # LIVENESS
    # ──────────────────────────────────────────────────────────────────────

    def _run_liveness(self, crop_img, full_frame):
        try:
            resized = cv2.resize(crop_img, (80, 80))
            score   = float(self.anti_spoof.predict(resized, self.model_path)[0][1])
            if score <= CONFIG["LIVENESS_THRESHOLD"]:
                self.after(0, self._show_result, False, score)
                return

            self.after(
                0,
                self._set_status,
                "IDENTIFYING...",
                CLR["warning"],
                "กำลังยืนยันตัวตนกับระบบ",
            )
            verified, detail = self._identify_face(full_frame, score)
            self.after(0, self._show_identity_result, verified, score, detail)
        except Exception as e:
            print(f"[Gatekeeper] liveness error: {e}")
            self.after(0, self._reset_state)

    def _identify_face(self, frame, liveness_score):
        """Send a full camera frame for server-side identity verification."""
        encoded_ok, encoded = cv2.imencode(
            ".jpg",
            frame,
            [cv2.IMWRITE_JPEG_QUALITY, 85],
        )
        if not encoded_ok:
            return False, "ไม่สามารถเตรียมภาพสำหรับตรวจสอบได้"

        headers = {}
        if GATEKEEPER_API_KEY:
            headers["X-Gatekeeper-Key"] = GATEKEEPER_API_KEY

        try:
            response = requests.post(
                f"{API_URL}/gatekeeper/identify",
                data={
                    "lab_code": LAB_CODE,
                    "liveness_score": f"{liveness_score:.6f}",
                },
                files={
                    "face_image": (
                        "gatekeeper.jpg",
                        encoded.tobytes(),
                        "image/jpeg",
                    ),
                },
                headers=headers,
                timeout=15,
            )
        except requests.exceptions.RequestException:
            return False, "เชื่อมต่อ Backend ไม่ได้"

        try:
            payload = response.json()
        except ValueError:
            return False, f"Backend ตอบกลับผิดรูปแบบ ({response.status_code})"

        if response.ok:
            return True, payload.get("user_name", "ยืนยันตัวตนสำเร็จ")

        detail = payload.get("detail", "ไม่สามารถยืนยันตัวตนได้")
        return False, str(detail)

    def _show_identity_result(self, verified: bool, score: float, detail: str):
        self.score_bar.set(score)
        self.score_pct_label.configure(text=f"{score*100:.0f}%")

        if verified:
            self._set_status(
                "ACCESS GRANTED ✓",
                CLR["granted"],
                f"ยืนยันตัวตน: {detail}",
            )
            self.score_badge.configure(
                text=f"  Score: {score:.2f}  ",
                fg_color="#0ea5e9",
                text_color="white",
            )
            self.score_bar.configure(progress_color=CLR["granted"])
            threading.Thread(
                target=lambda: [winsound.Beep(1000, 120), winsound.Beep(1200, 120)],
                daemon=True,
            ).start()
            self.after(CONFIG["RESET_DELAY_MS"], self._reset_state)
            return

        self._set_status("ACCESS DENIED ✗", CLR["denied"], detail)
        self.score_badge.configure(
            text=f"  Score: {score:.2f}  ",
            fg_color="#dc2626",
            text_color="white",
        )
        self.score_bar.configure(progress_color=CLR["denied"])
        threading.Thread(target=lambda: winsound.Beep(400, 600), daemon=True).start()
        self.after(CONFIG["RESET_DELAY_MS"], self._start_cooldown)

    # ──────────────────────────────────────────────────────────────────────
    # RESULT
    # ──────────────────────────────────────────────────────────────────────

    def _show_result(self, is_real: bool, score: float):
        self.score_bar.set(score)
        self.score_pct_label.configure(text=f"{score*100:.0f}%")

        if is_real:
            self._set_status("ACCESS GRANTED ✓", CLR["granted"], "ตรวจพบใบหน้าจริง — เปิดประตู")
            self.score_badge.configure(text=f"  Score: {score:.2f}  ", fg_color="#0ea5e9", text_color="white")
            self.score_bar.configure(progress_color=CLR["granted"])
            threading.Thread(target=lambda: [winsound.Beep(1000,120), winsound.Beep(1200,120)], daemon=True).start()
            self.after(CONFIG["RESET_DELAY_MS"], self._reset_state)
        else:
            self._set_status("ACCESS DENIED ✗", CLR["denied"], "ตรวจพบการหลอกลวง")
            self.score_badge.configure(text=f"  Score: {score:.2f}  ", fg_color="#dc2626", text_color="white")
            self.score_bar.configure(progress_color=CLR["denied"])
            threading.Thread(target=lambda: winsound.Beep(400, 600), daemon=True).start()
            self.after(CONFIG["RESET_DELAY_MS"], self._start_cooldown)

    def _set_status(self, text: str, color: str, sub: str):
        self.status_label.configure(text=text, text_color=color)
        self.sub_label.configure(text=sub)

    # ──────────────────────────────────────────────────────────────────────
    # COOLDOWN
    # ──────────────────────────────────────────────────────────────────────

    def _start_cooldown(self):
        self.in_cooldown    = True
        self._cooldown_left = CONFIG["SPOOF_COOLDOWN_SEC"]
        self.score_badge.configure(text="", fg_color="transparent")
        self.cooldown_frame.pack(padx=20, pady=8, fill="x")
        self._tick_cooldown()

    def _tick_cooldown(self):
        if self._cooldown_left > 0:
            self.cooldown_label.configure(text=f"🚫  ระบบล็อกชั่วคราว  {self._cooldown_left} วินาที")
            self._cooldown_left -= 1
            self.after(1000, self._tick_cooldown)
        else:
            self.cooldown_frame.pack_forget()
            self.in_cooldown = False
            self._reset_state()

    # ──────────────────────────────────────────────────────────────────────
    # RESET / DEV / CLEANUP
    # ──────────────────────────────────────────────────────────────────────

    def _reset_state(self):
        self._set_status("READY TO SCAN", CLR["ready"], "หันหน้าเข้าหากล้อง")
        self.score_badge.configure(text="", fg_color="transparent")
        self.score_bar.set(0)
        self.score_bar.configure(progress_color=CLR["ready"])
        self.score_pct_label.configure(text="—")
        self.is_scanning  = False
        self._last_faces  = []

    def _force_result(self, is_real: bool):
        if self.is_scanning or not self.models_loaded or self.in_cooldown:
            return
        self.is_scanning = True
        self._set_status("VERIFYING...", CLR["warning"], "")
        self.after(800, self._show_result, is_real, 0.95 if is_real else 0.18)

    def on_closing(self):
        self.cap.release()
        self.destroy()


if __name__ == "__main__":
    app = GatekeeperDemo()
    app.protocol("WM_DELETE_WINDOW", app.on_closing)
    app.mainloop()
