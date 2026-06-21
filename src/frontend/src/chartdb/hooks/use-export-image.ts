import { useContext } from 'react';
import { exportImageContext } from '@chartdb/context/export-image-context/export-image-context';

export const useExportImage = () => useContext(exportImageContext);
