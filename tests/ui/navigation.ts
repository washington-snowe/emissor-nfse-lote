export function useRouter() { return { push(path: string) { window.companyUiTest.path = path; }, refresh() {} }; }
