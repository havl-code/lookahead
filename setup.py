"""
Speedcube Training Explorer
Personal speedcubing performance analysis and training tool
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read README for long description
this_directory = Path(__file__).parent
long_description = (this_directory / "README.md").read_text(encoding="utf-8") if (this_directory / "README.md").exists() else ""

# Read requirements
requirements = []
if (this_directory / "requirements.txt").exists():
    with open("requirements.txt") as f:
        requirements = [line.strip() for line in f if line.strip() and not line.startswith("#")]

setup(
    name="speedcube-training-explorer",
    version="0.1.0",
    author="Viet Ha Ly",
    author_email="havl21@outlook.com",
    description="Personal speedcubing performance analysis and training tool using WCA database",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/havl-code/speedcube-training-explorer",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: End Users/Desktop",
        "Topic :: Games/Entertainment :: Puzzle Games",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.9",
    install_requires=requirements,
    entry_points={
        "console_scripts": [
            "speedcube=main:main",
        ],
    },
    keywords="speedcubing rubiks-cube wca data-analysis training performance",
)