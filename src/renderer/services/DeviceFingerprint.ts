export async function sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const DeviceFingerprint = {
    async getStableDeviceFingerprint(): Promise<string> {
        let uuid = localStorage.getItem('cds_device_fingerprint');
        if (!uuid) {
            uuid = crypto.randomUUID();
            localStorage.setItem('cds_device_fingerprint', uuid);
        }
        return await sha256(uuid);
    },
    
    getDeviceLabel(): string {
        const platformMatch = navigator.userAgent.match(/\(([^)]+)\)/);
        const platform = platformMatch ? platformMatch[1] : 'Unknown Device';
        return `Cast Director Studio (${platform})`;
    }
};
