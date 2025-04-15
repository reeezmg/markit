async function convertFileToBase64(file: File): Promise<string | null> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = function () {
            resolve(reader.result as string);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export async function prepareFileForApi(
    file: File,
): Promise<string | undefined> {
    const base64 = await convertFileToBase64(file);
    if (base64) {
        return base64;
    }
}
