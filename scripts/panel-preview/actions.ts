// These inert build-only boundaries keep the preview isolated from Auth and the database.
export async function signOut() {}
export async function selectWorkspaceCompany() { return { error: "Prévia estática de demonstração." }; }
