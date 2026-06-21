import { useContext } from 'react';
import { canvasContext } from '@chartdb/context/canvas-context/canvas-context';

export const useCanvas = () => useContext(canvasContext);
