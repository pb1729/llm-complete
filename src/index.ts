import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ICommandPalette } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { Anthropic } from '@anthropic-ai/sdk';

/**
 * Initialization data for the llm_complete extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'llm_complete:plugin',
  description: 'A JupyterLab extension.',
  autoStart: true,
  requires: [ISettingRegistry, ICommandPalette, INotebookTracker],
  activate: async (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry,
    palette: ICommandPalette,
    tracker: INotebookTracker
  ) => {
    console.log('Activating extension llm_complete.');
    const apiKeys: string[] = [];

    await settingRegistry
      .load(plugin.id)
      .then(settings => {
        console.log('llm_complete settings loaded:', settings.composite);
        apiKeys.push(settings.composite.userVariable as string);
      })
      .catch(reason => {
        console.error('Failed to load settings for llm_complete.', reason);
      });
    console.log('finished reading settingRegistry!');

    const anthropicClient = new Anthropic({
      apiKey: apiKeys[0],
      dangerouslyAllowBrowser: true
    });

    async function queryLLM(prompt: string, assistantPrompt: string) {
      const message = await anthropicClient.messages.create({
        max_tokens: 1024,
        messages: [
          { role: 'user', content: prompt.trim() },
          { role: 'assistant', content: assistantPrompt.trim() }
        ],
        model: 'claude-3-5-sonnet-latest'
      });
      const contentBlock = message.content[0];
      if (contentBlock.type === 'text') {
        return contentBlock.text;
      } else {
        return 'ERR: got a block type other than text!';
      }
    }

    // Add the command
    const command = 'llm_complete:assist';
    app.commands.addCommand(command, {
      label: 'Query LLM',
      execute: async () => {
        // Get the current notebook
        const notebook = tracker.currentWidget;
        if (!notebook) {
          return;
        }

        const activeCell = notebook.content.activeCell;
        if (!activeCell) {
          return;
        }

        const cells = notebook.content.model?.cells;
        if (!cells) {
          return;
        }
        const cellContents = [];
        for (let i = 0; i < cells.length; i++) {
          const cell = cells.get(i);
          if (cell) {
            let cellSource: string = cell.sharedModel.source;
            if (cell.type === 'code') {
              cellSource = '```python\n' + cellSource + '\n```';
            }
            cellContents.push(cellSource);
          }
        }

        const previousCellsString = cellContents.join('\n\n');

        // Get the index of the active cell
        const editor = activeCell.editor;
        if (!editor) {
          return;
        }
        const position = editor.getCursorPosition();
        const offset = editor.getOffsetAt(position);

        const currentText = editor.model.sharedModel.source;

        const userQuery = (
            '#!python&jupyter\n' +
            'This is a Jupyter notebook. All cells are printed below.\n' +
            previousCellsString +
            '\n\nAssistant task: Rewrite current cell from cursor position. Follow the instructions in the comments and markdown.'
          );
        console.log(userQuery);
        const contin = await queryLLM(userQuery, currentText);
        console.log(contin);

        const newText =
          currentText.slice(0, offset) + contin + currentText.slice(offset);

        editor.model.sharedModel.setSource(newText);
      }
    });

    // Add the keyboard shortcut
    app.commands.addKeyBinding({
      command,
      keys: ['Ctrl Shift Enter'],
      selector: '.jp-Notebook'
    });

    console.log('JupyterLab extension llm_complete is activated!');
  }
};

export default plugin;
