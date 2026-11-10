import { invoke } from '@tauri-apps/api/tauri';
import { createEdgeTts } from './client';

export const tts = createEdgeTts(invoke);

export * from './Config';
export * from './info';
