from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="acps-parser",
    version="2.0.0",
    author="Finault",
    author_email="support@finault.ai",
    description="AI Cost & Performance Standard - Parse and allocate AI provider invoices",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/finault/acps",
    project_urls={
        "Bug Tracker": "https://github.com/finault/acps/issues",
        "Documentation": "https://finault.ai/docs/acps",
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Intended Audience :: Financial and Insurance Industry",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Office/Business :: Financial :: Accounting",
    ],
    package_dir={"": "."},
    py_modules=["acps_parser"],
    python_requires=">=3.8",
    install_requires=[],
    extras_require={
        "dev": ["pytest", "black", "mypy"],
    },
    entry_points={
        "console_scripts": [
            "acps-parser=acps_parser:main",
        ],
    },
)
