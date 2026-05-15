import { WearableAnchorEngine } from './WearableAnchorEngine';
import type { HeadwearSubtype, WearableClass } from './WearableAnchorEngine';

export type PropSourceKind = 'generated' | 'uploaded' | 'saved' | 'unknown';

export type PropMetadataSidecar = {
    version: 1;
    imageFilename: string;
    name: string;
    prompt: string;
    originalPrompt?: string;
    classHint?: WearableClass;
    subtypeHint?: HeadwearSubtype;
    sourceKind: PropSourceKind;
    createdAt: number;
    updatedAt: number;
};

export type PropClassificationInput = {
    name?: string;
    prompt?: string;
    classHint?: WearableClass;
    subtypeHint?: HeadwearSubtype;
};

const WEARABLE_CLASSES: WearableClass[] = [
    'headwear',
    'eyewear',
    'earwear',
    'neckwear',
    'wristwear',
    'belt',
    'footwear',
    'held_prop',
    'generic_prop'
];

const HEADWEAR_SUBTYPES: HeadwearSubtype[] = [
    'crown',
    'tiara',
    'hat',
    'helmet',
    'veil',
    'hood',
    'headband',
    'hairpiece',
    'generic_headwear'
];

const isWearableClass = (value: unknown): value is WearableClass =>
    typeof value === 'string' && WEARABLE_CLASSES.includes(value as WearableClass);

const isHeadwearSubtype = (value: unknown): value is HeadwearSubtype =>
    typeof value === 'string' && HEADWEAR_SUBTYPES.includes(value as HeadwearSubtype);

const isSpecificClassHint = (value: WearableClass | undefined): value is Exclude<WearableClass, 'generic_prop'> =>
    !!value && value !== 'generic_prop';

const parseSidecar = (raw: string | null | undefined): PropMetadataSidecar | null => {
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as Partial<PropMetadataSidecar>;
        if (parsed.version !== 1 || typeof parsed.imageFilename !== 'string') return null;

        return {
            version: 1,
            imageFilename: parsed.imageFilename,
            name: typeof parsed.name === 'string' ? parsed.name : parsed.imageFilename,
            prompt: typeof parsed.prompt === 'string' ? parsed.prompt : parsed.imageFilename,
            originalPrompt: typeof parsed.originalPrompt === 'string' ? parsed.originalPrompt : undefined,
            sourceKind: parsed.sourceKind || 'unknown',
            classHint: isWearableClass(parsed.classHint) ? parsed.classHint : undefined,
            subtypeHint: isHeadwearSubtype(parsed.subtypeHint) ? parsed.subtypeHint : undefined,
            createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now()
        };
    } catch {
        return null;
    }
};

export class PropMetadataService {
    static inferClassHint(args: {
        name?: string;
        prompt?: string;
        note?: string;
    }): { classHint: WearableClass; subtypeHint?: HeadwearSubtype } {
        const classHint = WearableAnchorEngine.inferClass(args.name, args.prompt, args.note);
        const subtypeHint =
            classHint === 'headwear'
                ? WearableAnchorEngine.inferHeadwearSubtype(args.name, args.prompt, args.note)
                : undefined;

        return { classHint, subtypeHint };
    }

    static resolvePropFitClass(args: {
        selectedProp: PropClassificationInput;
        applyNote?: string;
    }): { fitClass: WearableClass; subtype?: HeadwearSubtype; inferredFitClass: WearableClass } {
        const { selectedProp, applyNote } = args;
        const inferredFitClass = WearableAnchorEngine.inferClass(
            selectedProp.name,
            selectedProp.prompt,
            applyNote
        );

        const fitClass = isSpecificClassHint(selectedProp.classHint)
            ? selectedProp.classHint
            : inferredFitClass;

        const subtype =
            fitClass === 'headwear'
                ? selectedProp.subtypeHint ||
                    WearableAnchorEngine.inferHeadwearSubtype(selectedProp.name, selectedProp.prompt, applyNote)
                : undefined;

        return { fitClass, subtype, inferredFitClass };
    }

    static buildSidecar(args: {
        imageFilename: string;
        name: string;
        prompt: string;
        originalPrompt?: string;
        sourceKind: PropMetadataSidecar['sourceKind'];
        classHint?: WearableClass;
        subtypeHint?: HeadwearSubtype;
    }): PropMetadataSidecar {
        const now = Date.now();
        return {
            version: 1,
            imageFilename: args.imageFilename,
            name: args.name,
            prompt: args.prompt,
            originalPrompt: args.originalPrompt,
            sourceKind: args.sourceKind,
            classHint: args.classHint,
            subtypeHint: args.subtypeHint,
            createdAt: now,
            updatedAt: now
        };
    }

    static sidecarNameForImage(filename: string): string {
        return filename.replace(/\.(png|jpg|jpeg|webp)$/i, '.json');
    }

    static async readNativeSidecar(folderPath: string, imageFilename: string): Promise<PropMetadataSidecar | null> {
        const api = window.electronAPI;
        if (!api?.joinPath || !api.exists || !api.readTextFile) return null;

        const sidecarPath = await api.joinPath(folderPath, PropMetadataService.sidecarNameForImage(imageFilename));
        if (!(await api.exists(sidecarPath))) return null;

        return parseSidecar(await api.readTextFile(sidecarPath));
    }

    static async writeNativeSidecar(folderPath: string, sidecar: PropMetadataSidecar): Promise<void> {
        const api = window.electronAPI;
        if (!api?.joinPath || !api.writeFile) return;

        try {
            const sidecarPath = await api.joinPath(folderPath, PropMetadataService.sidecarNameForImage(sidecar.imageFilename));
            const payload = new TextEncoder().encode(JSON.stringify(sidecar, null, 2));
            await api.writeFile(sidecarPath, payload);
        } catch (error) {
            console.warn('[PropMetadataService] Failed to write native prop sidecar:', error);
        }
    }

    static async readWebSidecar(
        propsHandle: FileSystemDirectoryHandle,
        imageFilename: string
    ): Promise<PropMetadataSidecar | null> {
        try {
            const sidecarHandle = await propsHandle.getFileHandle(PropMetadataService.sidecarNameForImage(imageFilename));
            const file = await sidecarHandle.getFile();
            return parseSidecar(await file.text());
        } catch {
            return null;
        }
    }

    static async writeWebSidecar(
        propsHandle: FileSystemDirectoryHandle,
        sidecar: PropMetadataSidecar
    ): Promise<void> {
        try {
            const sidecarHandle = await propsHandle.getFileHandle(
                PropMetadataService.sidecarNameForImage(sidecar.imageFilename),
                { create: true }
            );
            const writable = await sidecarHandle.createWritable();
            await writable.write(JSON.stringify(sidecar, null, 2));
            await writable.close();
        } catch (error) {
            console.warn('[PropMetadataService] Failed to write web prop sidecar:', error);
        }
    }
}
