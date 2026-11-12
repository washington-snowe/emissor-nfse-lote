export function useRouter() { return { push(path: string) { if (window.companyUiTest) window.companyUiTest.path = path; else window.workflowUiTest.path = path; }, refresh() {} }; }
