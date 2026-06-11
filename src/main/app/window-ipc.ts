import { BrowserWindow, type IpcMain } from 'electron';

export function registerWindowIpc(ipcMain: IpcMain): void {
  ipcMain.handle('window.getCurrentId', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.id ?? null;
  });

  ipcMain.handle('window.closeCurrent', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
}
