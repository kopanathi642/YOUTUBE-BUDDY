"""Self-hosted speech stack: pinned model assets, speech-to-text, translation, voices, speakers and dubbing.

Everything here runs on the CPU worker with open models whose licences allow commercial use (see catalog.py),
from files that are downloaded once, checked against pinned SHA-256 hashes and loaded before the worker takes jobs.
"""
