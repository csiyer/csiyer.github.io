"""
Analysis of behavioral data for fan-in/out color memory experiment

As a reminder, the design is as follows:
- 14 stimuli
- 2A->1B (fan-in), 1A->2B (fan-out), and 4 independent A->B = 14 stimuli in 8 pairs
- See pairs of stimuli, then report colors of stimuli


PREDICTIONS:
1. Having a shared associate (not just perceptual/semantic similarity) will produce repulsion
2. Integration will precede repulsion
3. If predictive instructions / sequential viewing, only fan-out B will be repulsed (not fan-in A)
"""

import os, glob, re
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

DATA_DIR = 'data'
FIG_DIR = 'figures'
os.makedirs(FIG_DIR, exist_ok=True)

# --- Load data ---
files = glob.glob(os.path.join(DATA_DIR, '*.csv'))
df = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)

# Pre-processing: Clean up jsPsych columns and extract IDs
remove_cols = ['success','timeout','failed_images','failed_audio','failed_video','internal_node_id','view_history','result']
df = df.drop(columns=[c for c in remove_cols if c in df.columns], errors='ignore')
if 'path' in df.columns:
    df['image_id'] = df['path'].str.extract(r'obj(\d+)').astype(float)

df_test = df[df['phase'] == 'color_test'].copy()
df_assoc = df[df['phase'] == 'assoc_test'].copy()


# --- Figure 1: overview ---
#   Number of participants, distribution of completion times, distribution of bonuses, distribution of overall accuracy
def plot_figure_1(df, df_test, df_assoc):
    print(f"Total Participants: {df['subject_id'].nunique()}")
    plt.figure(figsize=(18, 5))
    
    # Summary Metrics (from the final_summary phase)
    df_summary = df[df['phase'] == 'final_summary']
    print("\nFinal Metrics from Data:")
    cols_to_print = ['subject_id', 'total_time_min', 'final_avg_error', 'color_accuracy', 'assoc_accuracy', 'adjusted_accuracy', 'final_bonus_earned']
    # Filter columns that actually exist
    cols_to_print = [c for c in cols_to_print if c in df_summary.columns]
    print(df_summary[cols_to_print])

    # 1.1: Completion Time Distribution
    plt.subplot(1, 4, 1)
    sns.histplot(df_summary['total_time_min'].astype(float), bins=10, kde=True)
    plt.title('Completion Time (min)')
    
    # 1.2: Avg Color Error per Subject
    plt.subplot(1, 4, 2)
    acc_color = df_test.groupby('subject_id')['error_deg'].mean()
    sns.histplot(acc_color, bins=10, kde=True, color='green')
    plt.title('Avg Color Error per Sub (deg)')
    
    # 1.3: Associative Accuracy per Subject
    plt.subplot(1, 4, 3)
    if 'is_correct' in df_assoc.columns:
        acc_assoc = df_assoc.groupby('subject_id')['is_correct'].mean()
        sns.histplot(acc_assoc, bins=10, kde=True, color='blue')
        plt.axvline(0.33, color='red', linestyle='--', label='Chance (33%)')
        plt.title('Associative Acc per Sub')
        plt.legend()
    else:
        plt.title('Assoc Acc (Data Missing)')

    # 1.4: All Color Test Trials Error Distribution
    plt.subplot(1, 4, 4)
    sns.histplot(df_test['error_deg'], bins=45, kde=True, color='purple')
    plt.axvline(10, color='red', linestyle='--', label='10° Threshold')
    plt.title('Color Error Dist (All Trials)')
    plt.legend()
    
    plt.tight_layout()
    plt.savefig(os.path.join(FIG_DIR, 'figure_1_overview.png'))
    plt.show()


# --- Figure 2: color memory ---
def plot_figure_2(df_test):
    plt.figure(figsize=(15, 6))
    df_test.loc[:, 'group'] = df_test['condition'] + "_" + df_test['role']
    
    # 2.1: Error over blocks (repetitions)
    plt.subplot(1, 3, 1)
    sns.lineplot(data=df_test, x='block', y='error_deg', marker='o')
    plt.title('Error over Blocks')
    plt.ylabel('Abs Error (deg)')
    
    # 2.2: Error by Condition/Role
    plt.subplot(1, 3, 2)
    order = ['fanin_A', 'fanin_B', 'fanout_A', 'fanout_B', 'independent_A', 'independent_B']
    sns.barplot(data=df_test, x='group', y='error_deg', order=order)
    plt.xticks(rotation=45)
    plt.title('Error by Role')

    # 2.3: Frequency Comparison (using baked-in flag)
    if 'is_high_frequency' in df_test.columns:
        plt.subplot(1, 3, 3)
        df_test.loc[:, 'his_freq'] = df_test['is_high_frequency'].map({True: 'High (2x)', False: 'Low (1x)'})
        sns.pointplot(data=df_test, x='his_freq', y='error_deg', hue='condition')
        plt.title('Sequence Frequency Effect')
        plt.tight_layout()
    plt.savefig(os.path.join(FIG_DIR, 'figure_2_accuracy.png'))
    plt.show()


# --- Figure 3: repulsion ---
def plot_figure_3(df_test):
    if 'bias_deg' not in df_test.columns:
        print("\nSkipping Figure 3: 'bias_deg' column missing from data.")
        return
        
    df_bias = df_test.dropna(subset=['bias_deg'])

    plt.figure(figsize=(15, 6))
    df_bias.loc[:, 'group'] = df_bias['condition'] + "_" + df_bias['role']
    order = ['fanin_A', 'fanout_B', 'independent_A', 'independent_B']
    
    # 3.1: Bias over blocks
    plt.subplot(1, 2, 1)
    sns.lineplot(data=df_bias, x='block', y='bias_deg', hue='group', marker='o')
    plt.axhline(0, color='red', linestyle='--')
    plt.title('Repulsion Bias over Blocks')
    plt.ylabel('Bias towards colormate (deg)\n[Positive=Towards, Negative=Away]')

    # 3.2: Bias distribution
    plt.subplot(1, 2, 2)
    sns.violinplot(data=df_bias, x='group', y='bias_deg', order=order, inner="quartile")
    plt.axhline(0, color='red', linestyle='--')
    plt.title('Bias by Condition')
    plt.ylabel('Bias towards colormate (deg)\n[Positive=Towards, Negative=Away]')
    
    print("\nBias Summary (degrees):")
    print(df_bias.groupby(['group', 'block'])['bias_deg'].agg(['mean', 'std', 'count']))
    
    plt.tight_layout()
    plt.savefig(os.path.join(FIG_DIR, 'figure_3_repulsion.png'))
    plt.show()


if __name__ == "__main__" and not df.empty:
    plot_figure_1(df, df_test, df_assoc)
    plot_figure_2(df_test)
    plot_figure_3(df_test)
