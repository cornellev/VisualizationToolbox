from fastapi import FastAPI
import subprocess
import os

app = FastAPI()

@app.get("/")
def root():
    return {"status": "pyworker running"}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCRIPT_PATH = os.path.join(BASE_DIR, "script.py")

@app.post("/process/{folder_name}")
def process(folder_name: str):
    try:
        result = subprocess.run(
            ["python3", SCRIPT_PATH, folder_name],
            cwd=BASE_DIR,
            capture_output=True,
            text=True,
            check=True
        )
        return {"message": "Processing complete", "output": result.stdout}
    except subprocess.CalledProcessError as e:
        return {"error": e.stderr, "stdout": e.stdout}

