# raidocs README

This extension provides tools for authors of the RelationalAI documentation.

## Setup

The extension assumes you have a virtual environment in your project directory (the folder you have open in VS Code) and that it's called `.venv`. It also assumes you have Jupyter and pandas installed in that environment.

## Features

**Run Python Code**. Put your cursor in a fenced code block and invoke the command `"RelationalAI Docs: Run Python Code"`. The code block will be executed in a Python environment and the output will be displayed as a DataTable below the code block.

You can also select an interval of text in your editor and invoke the *Run Python Code* command. The selected text will be executed as a Python code block, with no output handling.

**Open Jupyter in Browser**. Your code exection is running against a Jupyter kernel. You can launch a Jupyter notebook that connects to this kernel by invoking the command `"RelationalAI Docs: Open Jupyter in Browser"`. There are also commands to restart and to stop this kernel.

**Insert Image**. Invoke the command `"RelationalAI Docs: Insert Image"` to insert an image in your markdown file. The image will be copied to the `public/img` folder in your project directory and the path to the image will be inserted in the markdown file.

**Insert Reference**. Invoke the command `"RelationalAI Docs: Insert Reference"` to docs reference in your Markdown file. You will get a searchable list of every heading and document in the project.