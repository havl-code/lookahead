"""
Speedcube Training Explorer
Personal speedcubing performance analysis and training tool
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read README for long description
this_directory = Path(__file__).parent
readme_file = this_directory / "README.md"
long_description = readme_file.read_text(encoding="utf-8") if readme_file.exists() else ""

setup(
    name="speedcube-training-explorer",
    version="1.0.0",
    author="Viet Ha Ly",
    author_email="havl21@outlook.com",
    description="A comprehensive web-based training tracker for speedcubers",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/havl-code/speedcube-training-explorer",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: End Users/Desktop",
        "Topic :: Games/Entertainment",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.8",
    install_requires=[
        "Flask>=3.1.2",
        "pandas>=2.3.3",
        "requests>=2.32.5",
        "PyYAML>=6.0.3",
    ],
    entry_points={
        "console_scripts": [
            "speedcube=main:main",
        ],
    },
    include_package_data=True,
    package_data={
        "": ["*.html", "*.css", "*.js", "*.png", "*.sql"],
    },
    keywords="speedcubing rubiks-cube wca training performance timer",
)