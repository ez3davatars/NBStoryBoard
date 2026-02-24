import type { DropdownOption } from '../ui/Dropdown';

export const SHOT_TYPES: DropdownOption[] = [
    { type: 'option', value: 'Extreme Wide Shot', label: 'Extreme Wide Shot (EWS / Establishing)' },
    { type: 'option', value: 'Wide Shot', label: 'Wide Shot (WS)' },
    { type: 'option', value: 'Full Shot', label: 'Full Shot (FS)' },
    { type: 'option', value: 'Medium Full Shot', label: 'Medium Full / Cowboy (MFS)' },
    { type: 'option', value: 'Medium Shot', label: 'Medium Shot (MS)' },
    { type: 'option', value: 'Medium Close-Up', label: 'Medium Close-Up (MCU)' },
    { type: 'option', value: 'Close-Up', label: 'Close-Up (CU)' },
    { type: 'option', value: 'Extreme Close-Up', label: 'Extreme Close-Up (ECU)' },
    { type: 'option', value: 'Two-Shot', label: 'Two-Shot' },
    { type: 'option', value: 'Over-the-Shoulder', label: 'Over-the-Shoulder (OTS)' },
    { type: 'option', value: 'Point-of-View', label: 'Point-of-View (POV)' },
    { type: 'option', value: 'Insert Shot', label: 'Insert / Detail Shot' },
    { type: 'option', value: 'Cutaway', label: 'Cutaway' },
    { type: 'option', value: 'Aerial Shot', label: 'Aerial / Drone Shot' }
];

export const LENS_OPTIONS: DropdownOption[] = [
    { type: 'option', value: '14mm', label: '14mm (Ultra-wide)' },
    { type: 'option', value: '18mm', label: '18mm (Wide)' },
    { type: 'option', value: '24mm', label: '24mm (Wide)' },
    { type: 'option', value: '28mm', label: '28mm (Wide)' },
    { type: 'option', value: '35mm', label: '35mm (Standard wide)' },
    { type: 'option', value: '50mm', label: '50mm (Normal)' },
    { type: 'option', value: '65mm', label: '65mm (Portrait)' },
    { type: 'option', value: '85mm', label: '85mm (Portrait)' },
    { type: 'option', value: '100mm', label: '100mm (Tele)' },
    { type: 'option', value: '135mm', label: '135mm (Tele)' },
    { type: 'option', value: '200mm', label: '200mm (Tele)' },
    { type: 'option', value: '24-70mm Zoom', label: '24–70mm Zoom' },
    { type: 'option', value: '70-200mm Zoom', label: '70–200mm Zoom' },
    { type: 'option', value: 'Anamorphic', label: 'Anamorphic (General)' },
    { type: 'option', value: 'Macro', label: 'Macro (Detail)' }
];

export const CAMERA_MOTIONS: DropdownOption[] = [
    { type: 'option', value: 'Locked-off', label: 'Locked-off (Tripod)' },
    { type: 'option', value: 'Handheld', label: 'Handheld' },
    { type: 'option', value: 'Steadicam', label: 'Steadicam' },
    { type: 'option', value: 'Gimbal', label: 'Gimbal' },
    { type: 'option', value: 'Dolly In', label: 'Dolly In' },
    { type: 'option', value: 'Dolly Out', label: 'Dolly Out' },
    { type: 'option', value: 'Tracking Follow', label: 'Tracking Follow' },
    { type: 'option', value: 'Truck Left / Right', label: 'Truck Left / Right' },
    { type: 'option', value: 'Pan Left / Right', label: 'Pan Left / Right' },
    { type: 'option', value: 'Tilt Up / Down', label: 'Tilt Up / Down' },
    { type: 'option', value: 'Crane Up / Down', label: 'Crane / Jib Up / Down' },
    { type: 'option', value: 'Arc Move', label: 'Arc / Circle Move' },
    { type: 'option', value: 'Slider Push', label: 'Slider Push' },
    { type: 'option', value: 'Whip Pan', label: 'Whip Pan' },
    { type: 'option', value: 'Zoom In / Out', label: 'Zoom In / Out' },
    { type: 'option', value: 'Drone Rise', label: 'Drone Rise' },
    { type: 'option', value: 'Drone Push-in', label: 'Drone Push-in' }
];
