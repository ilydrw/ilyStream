/// <reference types="vite/client" />

import { ElectronAPI } from '../preload'

declare global {
  interface Window {
    api: ElectronAPI
  }
}
