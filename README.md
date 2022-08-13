# raidocs README

The raidocs extension provides tools to support documentation authors at RelationalAI.

## Snippets

To use the extension, open the `raidocs-next` folder as your workspace in VS Code and then open a Markdown file that you want to edit. Type one of the following:

- `rel`
- `table`
- `alert`
- `image`

Press `control+space` with the cursor immediately following the last character. Select the raidocs option in the resulting menu, and a snippet will be inserted. Press tab to go from one placeholder to the next.

## Images

As an alternative to the `image` snippet, you can run a command that copies an image to the correct directory and inserts the appropriate `ImgFig` code into your Markdown file.  Do `command+shift+P` to open the command palette, and start typing "insert image". Select the option called "raidocs: Insert Image" when it appears. Use the file dialog that opens to choose the desired image.

## References

You can use the extension to create references to sections of other articles. Do `command+shift+P` to open the command palette, and start typing "insert reference". Select the option called "raidocs: Insert Reference" when it appears. You'll get a list of articles on the site, which you can filter by typing search characters. When you select the article you want to link, a list of headers within that article will appear. When you select the relevant section header, the path for that section is inserted.

## Starting the development server

The command "raidocs: Start Server" uses the integrated terminal to run `pnpm dev`. On macOS, it will also launch a window in your default browser with the address `http://localhost:3000`. This command does not run `npm scrub-build`, so you should do that before running this command if the development environment has changed.

## Running Code Cells

The command "raidocs: Run Code Cells" uses the integrated terminal to run raidocs parser on the currently open article. This requires that you have the appropriate credentials in `~/.rai/config` on your system.