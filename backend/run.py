from pathlib import Path
import uvicorn

if __name__ == "__main__":
    data_dir = Path(__file__).parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
