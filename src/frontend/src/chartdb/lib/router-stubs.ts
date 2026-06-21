// Stub for react-router-dom hooks when ChartDB is embedded without its own router
export const useNavigate = () => () => {};
export const useParams = () => ({}) as any;
export const useLocation = () => ({ pathname: '/', search: '', hash: '', state: null, key: '' });
export const useSearchParams = () => [new URLSearchParams(), () => {}] as const;