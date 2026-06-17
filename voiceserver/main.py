import uvicorn
import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 9091))
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
    )
