export interface VeoFivePartDraft {
    cinematography?: string;
    cinematographyShotType?: string;
    cinematographyLens?: string;
    cinematographyMotion?: string;
    subject?: string;
    action?: string;
    context?: string;
    styleAmbiance?: string;
}

export interface VeoAudioBlock {
    dialogue?: string;
    sfx?: string;
    ambience?: string;
    music?: string;
}

export interface VeoTimestampBeat {
    startMs: number;
    endMs: number;
    prompt: string;
}

const formatMsToTimestamp = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const formatVeoFivePartPrompt = (draft: VeoFivePartDraft): string => {
    const parts = [];

    if (draft.cinematography) {
        parts.push(draft.cinematography.trim());
    }
    if (draft.subject) {
        parts.push(draft.subject.trim());
    }
    if (draft.action) {
        parts.push(draft.action.trim());
    }
    if (draft.context) {
        parts.push(draft.context.trim());
    }
    if (draft.styleAmbiance) {
        parts.push(draft.styleAmbiance.trim());
    }

    return parts.join(' ').trim();
};

export const formatVeoAudioBlock = (audio: VeoAudioBlock): string => {
    const blocks = [];

    if (audio.dialogue) {
        blocks.push(`"${audio.dialogue.trim()}"`);
    }
    if (audio.sfx) {
        blocks.push(`(${audio.sfx.trim()})`);
    }
    if (audio.ambience) {
        blocks.push(`(${audio.ambience.trim()})`);
    }
    if (audio.music) {
        blocks.push(`(${audio.music.trim()})`);
    }

    return blocks.join(' ').trim();
};

export const formatVeoTimestampSequence = (beats: VeoTimestampBeat[]): string => {
    return beats.map(beat => {
        const startStr = formatMsToTimestamp(beat.startMs);
        const endStr = formatMsToTimestamp(beat.endMs);
        return `[${startStr}-${endStr}] ${beat.prompt.trim()}`;
    }).join('\n');
};

export const buildCombinedPrompt = (
    draft: VeoFivePartDraft,
    audio?: VeoAudioBlock,
    beats?: VeoTimestampBeat[],
    negativePrompt?: string
): { prompt: string, negativePrompt?: string } => {
    const finalPromptParts = [];

    const mainPrompt = formatVeoFivePartPrompt(draft);
    if (mainPrompt) {
        finalPromptParts.push(mainPrompt);
    }

    if (audio) {
        const audioBlock = formatVeoAudioBlock(audio);
        if (audioBlock) {
            finalPromptParts.push(`\nAudio: ${audioBlock}`);
        }
    }

    if (beats && beats.length > 0) {
        const sequence = formatVeoTimestampSequence(beats);
        if (sequence) {
            finalPromptParts.push(`\nSequence:\n${sequence}`);
        }
    }

    return {
        prompt: finalPromptParts.join('\n').trim(),
        ...(negativePrompt && { negativePrompt: negativePrompt.trim() })
    };
};
