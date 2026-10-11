import logging


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
    )

    logging.getLogger("uvicorn").handlers.clear()
    logging.getLogger("uvicorn").propagate = True
