type V = ((data: unknown) => boolean) & { errors?: { instancePath: string; message?: string }[] | null };
export const validate_manifest: V;
export const validate_review: V;
export const validate_graph: V;
export const validate_trace: V;
