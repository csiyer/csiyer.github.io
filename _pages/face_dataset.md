---
layout: archive
title: "Face Dataset"
permalink: /face_dataset/
author_profile: true
---

In my [undergraduate thesis research](https://purl.stanford.edu/ym602qk4242), I wanted to study race-related biases in face memory, with a high degree of experimental and psychophysical control. I had three key criteria:

1.  **Broad Sampling**: Faces must sample thoroughly from a wide array of appearances, ages, and race-related features.
2.  **Multi-Angle Imaging**: Faces must be imaged from different angles to test the ability to generalize across viewpoints.
3.  **Low-Level Control**: Face images must be well controlled for luminance, viewing angle, and other low-level cues.

I deciding to create my own dataset, using the [MUCT Face Database](http://www.milbo.org/muct/) as a starting point.

## Methods

I used [FaceBuilder for Blender](https://keentools.io/products/facebuilder-for-blender) to manually landmark multi-viewpoint MUCT images.

<p align="center">
  <img src='/images/face_dataset/face_landmarking.png' width="75%" alt="Face landmarking">
</p>

This created a 3D mesh and texture for each face, which could then be rotated and imaged under controlled lighting conditions.

<p align="center">
  <img src='/images/face_dataset/face_rotate.gif' width="30%" alt="3D Face rotation">
</p>

Finally, I produced grayscale and luminance-matched images across 15 angles (5x3 grid of viewpoints).

<p align="center">
  <img src='/images/face_dataset/face_array.png' width="80%" alt="5x3 grid of viewpoints">
</p>

## Dataset

[The dataset is available on GitHub](https://github.com/csiyer/face_database). It contains 156 individuals and is organized into 3D meshes, textures, grayscale/luminance-matched imagery, and processing notes.

## Behavioral Data (on request)

**1. Classification task**: behavioral data from 241 online participants providing population-level estimates of perceived racial and gender characteristics.

<p align="center">
  <img src='/images/face_dataset/face_classification.png' width="70%" alt="Classification task">
</p>

**2. Perception-memory task**: data from 135 participants performing dynamic oddity and recognition memory tests.

<p align="center">
    <img src='/images/face_dataset/face_memorytask.png' width="90%">    
    <img src='/images/face_dataset/face_memorytask2.png' width="90%">
</p>

All data are available via email request.
