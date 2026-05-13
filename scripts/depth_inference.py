import os
import sys

# Legacy/internal depth path; not active for launch.
# --- Ensure Depth-Anything-V2 is importable ---
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEPTH_ANYTHING_DIR = os.path.join(PROJECT_ROOT, "Depth-Anything-V2")

if DEPTH_ANYTHING_DIR not in sys.path:
    sys.path.insert(0, DEPTH_ANYTHING_DIR)

print("[depth_inference] Using Depth-Anything-V2 from:", DEPTH_ANYTHING_DIR)

import argparse
import cv2
import torch
import numpy as np
from PIL import Image

# --- Import Depth Anything V2 ---
# from depth_anything_v2.dpt import DepthAnythingV2

import argparse
import cv2
import torch
import numpy as np
from PIL import Image

# This script assumes the user has installed Depth Anything V2 
# either via pip or by cloning the repo and adding it to PYTHONPATH.
# For V1, we recommend: pip install torch torchvision opencv-python pillow

def generate_depth(input_path, output_path, model_type='vits'):
    """
    Generates an 8-bit grayscale depth map for the given image.
    Following the pipeline design: 
    - 255 = Closest
    - 0 = Furthest
    """
    try:
        # --- DISABLED: Depth-Anything-V2 Inference ---
        # from depth_anything_v2.dpt import DepthAnythingV2
        # device = 'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'
        # model_configs = { ... }
        # depth_anything = DepthAnythingV2(**model_configs[model_type])
        # checkpoint_path = ...
        # depth_anything.load_state_dict(torch.load(checkpoint_path, map_location='cpu'))
        # depth_anything = depth_anything.to(device).eval()

        # Load image
        raw_img = cv2.imread(input_path)
        if raw_img is None:
            print(f"ERROR: Could not load image at {input_path}")
            sys.exit(1)
            
        # --- NO-OP: Produce flat 128 (middle depth) map ---
        h, w = raw_img.shape[:2]
        depth_norm = np.full((h, w), 128, dtype=np.uint8)
        
        # Save output
        cv2.imwrite(output_path, depth_norm)
        print(f"SUCCESS: NO-OP Depth map (flat 128) saved to {output_path}")

    except Exception as e:
        print(f"ERROR: NO-OP Inference failed: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generate Depth Map from Image')
    parser.add_argument('--input', required=True, help='Path to background image')
    parser.add_argument('--output', required=True, help='Path to save depth map')
    parser.add_argument('--model', default='vits', help='Model type (vits, vitb, vitl, vitg)')
    
    args = parser.parse_args()
    generate_depth(args.input, args.output, args.model)
