import pandas as pd
import glob
import os
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np

def run_analysis(data_dir='data'):
    # Set aesthetics
    sns.set_theme(style="whitegrid", palette="muted")
    plt.rcParams['font.family'] = 'sans-serif'
    
    # Load all CSVs
    all_files = glob.glob(os.path.join(data_dir, "*.csv"))
    # Filter out potential summary files created by extract_bonus.py
    data_files = [f for f in all_files if not ('prolific_bonuses' in f or 'bonus_summary' in f)]
    
    if not data_files:
        print("No participant data files found.")
        return

    all_trials = []
    all_summaries = []
    all_checks = []

    for file in data_files:
        try:
            df = pd.read_csv(file)
            p_id = df['prolific_id'].dropna().unique()[0]
            if p_id == 'local':
                p_id = df['subject_id'].dropna().unique()[0]

            # 1. Extract Trial Data (Learning Curve)
            trials = df[df['is_trial'].astype(str).str.lower() == 'true'].copy()
            trials['subject'] = p_id
            all_trials.append(trials)

            # 2. Extract Summary Data (Bonus & Time)
            summary = df[df['is_summary'].astype(str).str.lower() == 'true'].copy()
            if not summary.empty:
                summary['subject'] = p_id
                # Completion time in minutes (max time_elapsed)
                summary['completion_minutes'] = df['time_elapsed'].max() / 60000
                all_summaries.append(summary)

            # 3. Extract Attention Checks
            checks = df[df['is_attention_check'].astype(str).str.lower() == 'true'].copy()
            if not checks.empty:
                checks['subject'] = p_id
                all_checks.append(checks)
                
        except Exception as e:
            print(f"Error reading {file}: {e}")

    if not all_trials:
        print("No trial data found.")
        return
        
    df_trials = pd.concat(all_trials)
    df_sums = pd.concat(all_summaries) if all_summaries else pd.DataFrame()
    df_checks = pd.concat(all_checks) if all_checks else pd.DataFrame()

    # Create Figures
    fig, axes = plt.subplots(2, 2, figsize=(16, 12))
    plt.subplots_adjust(hspace=0.3, wspace=0.2)

    # --- Plot A: Completion Times ---
    if not df_sums.empty:
        sns.histplot(df_sums['completion_minutes'], bins=10, ax=axes[0, 0], color='skyblue', kde=True)
        axes[0, 0].set_title('Distribution of Completion Times', fontsize=16, fontweight='bold')
        axes[0, 0].set_xlabel('Minutes', fontsize=12)
        axes[0, 0].set_ylabel('Count', fontsize=12)
    else:
        axes[0, 0].text(0.5, 0.5, 'No Summary Data', ha='center')

    # --- Plot B: Final Bonuses ---
    if not df_sums.empty:
        sns.histplot(df_sums['final_bonus'].astype(float), bins=10, ax=axes[0, 1], color='salmon', kde=True)
        axes[0, 1].set_title('Distribution of Total Bonuses', fontsize=16, fontweight='bold')
        axes[0, 1].set_xlabel('Bonus ($)', fontsize=12)
    else:
        axes[0, 1].text(0.5, 0.5, 'No Bonus Data', ha='center')

    # --- Plot C: Attention Checks ---
    if not df_checks.empty:
        # Robustly calculate success per participant (case-insensitive)
        if 'response' in df_checks.columns and 'correct_key' in df_checks.columns:
            df_checks['success_bool'] = df_checks.apply(
                lambda x: str(x['response']).lower() == str(x['correct_key']).lower() 
                if pd.notnull(x['correct_key']) and pd.notnull(x['response']) else False, 
                axis=1
            )
        else:
            df_checks['success_bool'] = df_checks['success'].astype(str).str.lower().map({'true': 1, 'false': 0})

        # Calculate accuracy per subject
        check_acc = df_checks.groupby('subject')['success_bool'].mean() * 100
        
        # Use explicit bins to handle cases with only one participant/value
        sns.histplot(check_acc, bins=range(0, 111, 10), ax=axes[1, 0], color='lightgreen', kde=False)
        axes[1, 0].set_title(f'Attention Check Performance (N={len(check_acc)})', fontsize=16, fontweight='bold')
        axes[1, 0].set_xlabel('% Correct', fontsize=12)
        axes[1, 0].set_xlim(-5, 105) 
        axes[1, 0].set_xticks(range(0, 101, 20))
    else:
        axes[1, 0].text(0.5, 0.5, 'No Attention Check Data', ha='center')

    # --- Plot D: Learning Curve (Key Graph) ---
    # Prepare data for plotting (Choice of lucky deck)
    df_trials['lucky_choice_bin'] = df_trials['is_lucky_choice'].astype(str).str.lower().map({'true': 1, 'false': 0})
    
    # Re-calculate trial_index based on sequence per subject (0, 1, 2...)
    # This avoids conflicts if the CSV 'trial_index' is the global jsPsych counter
    df_trials['trial_index'] = df_trials.groupby('subject').cumcount()

    # Calculate group average per trial
    group_avg = df_trials.groupby('trial_index')['lucky_choice_bin'].mean().rolling(window=10, min_periods=1).mean()
    
    # Plot individual lines (smoothed)
    for sub in df_trials['subject'].unique():
        sub_data = df_trials[df_trials['subject'] == sub].sort_values('trial_index')
        smoothed = sub_data['lucky_choice_bin'].rolling(window=15, min_periods=1).mean()
        axes[1, 1].plot(sub_data['trial_index'], smoothed, color='gray', alpha=0.15, linewidth=1)

    # Plot Group Mean
    axes[1, 1].plot(group_avg.index, group_avg.values, color='teal', linewidth=4, label='Group Mean (10nd smoothed)')
    
    # Baseline (chance)
    axes[1, 1].axhline(0.5, color='red', linestyle='--', alpha=0.5, label='Chance (0.5)')
    
    axes[1, 1].set_title('Choice of Memlucky Deck Over Time', fontsize=16, fontweight='bold')
    axes[1, 1].set_xlabel('Trial Index', fontsize=12)
    axes[1, 1].set_ylabel('Proportion Lucky Choice', fontsize=12)
    axes[1, 1].set_ylim(0, 1.05)
    axes[1, 1].legend()

    # Final Save
    plt.tight_layout()
    plot_path = 'experiment_analysis.png'
    plt.savefig(plot_path, dpi=300)
    print(f"\nAnalysis complete! Plots saved to '{plot_path}'")
    plt.show()

if __name__ == "__main__":
    run_analysis()
