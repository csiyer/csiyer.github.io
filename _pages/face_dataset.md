---
layout: archive
title: ""
permalink: /face_dataset/
author_profile: true
---

{% include base_path %}

# Background
In my [undergraduate thesis research](https://purl.stanford.edu/ym602qk4242), I wanted to study race-related biases in face memory, with a high degree of experimental and psychophysical control. I had three key criteria:
(1) Faces must sample thoroughly from a wide array of appearances, ages, and race-related features. This rules out many old-school datasets in the racial bias literature that only use very stereotypically white and black (usually male) faces.
(2) Faces must be *imaged from different angles*. This was very important to me, as I wanted to test specifically for people's ability to generalize encoding of one face view to a novel perspective--a kind of medial temporal lobe-dependent representational transformation. Sadly, this ruled out any web-scraped face datasets, which would only image an individual from one angle (for examples commonly used in machine learning training sets, see [here](https://paperswithcode.com/datasets?task=face-recognition)). 
(1) Face images must be well controlled for low-level cues (luminance, viewing angle, etc.). My gold standards here are the [Chicago Face Dataset](https://www.chicagofaces.org) and the beautiful [Humanae](https://angelicadass.com/photography/humanae/) project by Angélica Dass. These images, however, are only from one angle, so #2 rules them out. The way that most previous experiments achieve this level of control is using [FaceGen](https://facegen.com)--if you have ever seen these faces, you likely know why I didn't want to use them. They are quite uncanny, and I did not believe that I could count on them activating the same in-the-wild biases that I was trying to study.

I did manage to find one old face dataset, the [MUCT Face Database](http://www.milbo.org/muct/), that satisfies both broad/dense sampling of appearance and multiple viewpoints per subject. However, the low-level features were not very reliable. So, I decided to make my own faces, using MUCT as a starting point!

# Methods
I used [FaceBuilder for Blender](https://keentools.io/products/facebuilder-for-blender) to manually landmark the multi-viewpoint MUCT images. Faces or images that couldn't be reliably landmarked, or showed abnormal expressions or viewpoints were discarded.
<p style="text-align: center;">
  <img src='/images/face_dataset/face_landmarking.png' width="75%">
</p>

This created, for each face, a 3D mesh and texture (.blend object). The textures themselves were manually altered to remove image artifacts from the 3D rendering process. 
<p style="text-align: center;">
  <img src='/images/face_dataset/face_rotate.gif' width="30%">
</p>

Each 3D face model can then be rotated by a particular angle and imaged under controlled lighting conditions. 
<p style="text-align: center;">
  <img src='/images/face_dataset/faces.png'>
</p>


Finally, I grayscaled and luminance matched the images I used, to produce a final set of faces. For each face, this produced an array of images.
<p style="text-align: center;">
    <img src='/images/face_dataset/faces_grayscale.png'>
    <img src='/images/face_dataset/face_array.png' width="80%">
</p>


# Dataset
[The dataset I've created can be viewed and downloaded from GitHub](https://github.com/csiyer/face_database). This repository contains 156 individuals, and is organized as follows: 

(1) `blender_faces` contains the 3D `.blend` object (3D mesh) to be opened and edited in blender.

(2) `blender_faces/textures` contains 2D image textures, automatically loaded by the `.blend` files and overlaid onto the meshes.

(3) `version1_gray_lm1` contains, for each individual, 15 grayscale and luminance-matched images from a 5x3 grid of viewpoints (pictured above). Files are named `id{#}_{Degrees left/right/center}{L/R/C}_{up/down/center U/D/C}.png`.

(4) `notes` contains notes on artifacts, exclusions, and edits during the processing pipeline, for each identity.

(5) `scripts` contains scripts to match luminance of grayscale iamges, calculate model-based estimates of image memorability, generate metadata, etc. 

(6) `classification_metadata` contains data extracted from the classification task, described in more detail below.


To view licensing/public viewing criteria or to obtain the raw images used, see the [MUCT Face Database](http://www.milbo.org/muct/). 


# Behavioral Data (on request)
## 1. Classification task
I have collected 2 different kinds of behavioral data using these faces. In the first task, 241 online participants classified each of the faces with the following format: 

<p style="text-align: center;">
    <img src='/images/face_dataset/face_classification.png' width="70%">
</p>


These behavioral ratings provide a population-level estimate of perceived racial and gender characteristics of the faces, rather than relying on idiosyncratic manual judgements. They also offer continuous responses (response percentages) to quantify these characteristics in a non-binarized or non-categorized fashion.

## 2. Perception-memory task
I have also collected a sample of 135 online participants performing a 2-part task, involving a 3-way concurrent discrimination (oddity) task and a subsequent alternative-forced choice recognition memory test for faces from the oddity task. In both tasks, the two faces present on each trial were paired using the classification task data. The oddity trials also include a second angle view of one of the faces. I collected accuracy and response times for 40 trials of visual discrimination (oddity) and 40 trials of AFC recognition (on previously-seen oddities and unseen foils). On a subset of memory trials, the oddity image was rotated from its studied viewpoint.

<p style="text-align: center;">
    <img src='/images/face_dataset/face_memorytask.png' width="90%">    
    <img src='/images/face_dataset/face_memorytask2.png' width="90%">
</p>



All of these data are available upon email request.

©Christopher S. Iyer

