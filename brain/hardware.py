"""Read-only host capability report. Run with the standard Python interpreter."""
import ctypes
import json
import os
import platform
import shutil
import subprocess
import sys


def ram_bytes():
    if sys.platform == "win32":
        class MemoryStatus(ctypes.Structure):
            _fields_ = [("size", ctypes.c_uint32), ("load", ctypes.c_uint32),
                        ("physical", ctypes.c_uint64), ("rest", ctypes.c_uint64 * 6)]
        status = MemoryStatus()
        status.size = ctypes.sizeof(status)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return status.physical
    else:
        try:
            return os.sysconf("SC_PHYS_PAGES") * os.sysconf("SC_PAGE_SIZE")
        except (AttributeError, OSError, ValueError):
            pass
    return None


def report():
    devices = []
    smi = shutil.which("nvidia-smi")
    if smi:
        try:
            output = subprocess.run([smi, "--query-gpu=name,compute_cap", "--format=csv,noheader"],
                                    timeout=4, capture_output=True, text=True)
            if output.returncode == 0:
                devices = output.stdout.strip().splitlines()
        except (OSError, subprocess.TimeoutExpired):
            pass
    memory = ram_bytes()
    return {"system": platform.system(), "logical_cpus": os.cpu_count(),
            "host_ram_gib": round(memory / 2**30, 1) if memory else None,
            "driver_reported_cuda_devices": devices, "ad_render_engine": "FFmpeg CPU",
            "ad_cloud_inference_cost_usd": 0}


if __name__ == "__main__":
    print(json.dumps(report(), indent=2))
