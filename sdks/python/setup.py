"""Setup configuration for the Finault Python SDK"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="finault",
    version="1.0.0",
    author="Finault",
    author_email="support@finault.ai",
    description="Official Python SDK for Finault AI Cost Governance API",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/finault/finault-python",
    project_urls={
        "Bug Tracker": "https://github.com/finault/finault-python/issues",
        "Documentation": "https://docs.finault.ai",
    },
    packages=find_packages(),
    classifiers=[
        "Development Status :: 5 - Production/Stable",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: Office/Business :: Financial",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.8",
    install_requires=[
        "requests>=2.28.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0",
            "pytest-cov>=3.0",
            "black>=22.0",
            "flake8>=4.0",
            "mypy>=0.950",
        ],
    },
    entry_points={
        "console_scripts": [
            "finault=finault.cli:main",
        ],
    },
    keywords="finault ai cost governance api sdk cli sync",
    zip_safe=False,
)
