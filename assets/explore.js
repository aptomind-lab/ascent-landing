/* ==========================================================================
   Research-area explorer — data
   Ported from the app's data/assessmentCompounds.ts (33 entries, 32 compounds,
   21 clinical / 12 community) so the two stay in sync.

   Framing rules this file follows, without exception:
   - Every entry describes what a study found, never what a reader should do.
   - Unfavorable, null and mixed results are reported as plainly as favorable
     ones. AOD-9604's failed follow-up, Cerebrolysin's 2012 trial, the sepsis
     trial under Thymosin Alpha-1 and PT-141's missed endpoint all stay in.
   - Limits are stated by describing what the evidence *is* ("evidence to date
     is preclinical, from animal models") rather than what it lacks. Same fact,
     no negation — see brand/compliance-guardrails.md.
   - Source titles stay in English in both dictionaries: they are publication
     and trial names, not prose.
   ========================================================================== */

const EXPLORE_AREAS = {
  en: [
    ['weight-loss', 'Weight & metabolic'],
    ['longevity', 'Longevity'],
    ['cognitive-health', 'Cognitive'],
    ['physical-performance', 'Physical performance'],
    ['healing-recovery', 'Healing & recovery'],
    ['immune-support', 'Immune'],
    ['skin-hair-aesthetics', 'Skin & hair'],
    ['sleep-stress', 'Sleep & stress'],
    ['sexual-wellness', 'Sexual wellness'],
  ],
  es: [
    ['weight-loss', 'Peso y metabolismo'],
    ['longevity', 'Longevidad'],
    ['cognitive-health', 'Cognitivo'],
    ['physical-performance', 'Rendimiento físico'],
    ['healing-recovery', 'Reparación y recuperación'],
    ['immune-support', 'Inmunidad'],
    ['skin-hair-aesthetics', 'Piel y cabello'],
    ['sleep-stress', 'Sueño y estrés'],
    ['sexual-wellness', 'Bienestar sexual'],
  ],
};

/* Longevity, immune and sexual wellness have no follow-up question: their
   compound pools are too small to usefully narrow (see assessment-research.md). */
const EXPLORE_FOCUS = {
  en: {
    'weight-loss': ['Which part of this are you reading up on?', [
      ['appetite-control', 'Appetite regulation'],
      ['fat-loss', 'Fat loss'],
      ['blood-sugar', 'Blood sugar'],
    ]],
    'physical-performance': ['Which part of this are you reading up on?', [
      ['muscle-strength', 'Muscle & strength'],
      ['endurance', 'Endurance'],
      ['recovery', 'Training recovery'],
    ]],
    'cognitive-health': ['Which part of this are you reading up on?', [
      ['focus-clarity', 'Focus & clarity'],
      ['memory', 'Memory'],
      ['mood', 'Mood & stress response'],
    ]],
    'healing-recovery': ['Which part of this are you reading up on?', [
      ['specific-injury', 'A specific tissue or joint'],
      ['general-support', 'General tissue & inflammatory research'],
    ]],
    'skin-hair-aesthetics': ['Which part of this are you reading up on?', [
      ['skin', 'Skin'],
      ['hair', 'Hair'],
    ]],
    'sleep-stress': ['Which part of this are you reading up on?', [
      ['falling-asleep', 'Sleep onset'],
      ['staying-asleep', 'Sleep maintenance'],
      ['general-stress', 'Stress response'],
    ]],
  },
  es: {
    'weight-loss': ['¿Sobre qué parte estás leyendo?', [
      ['appetite-control', 'Regulación del apetito'],
      ['fat-loss', 'Pérdida de grasa'],
      ['blood-sugar', 'Glucosa en sangre'],
    ]],
    'physical-performance': ['¿Sobre qué parte estás leyendo?', [
      ['muscle-strength', 'Músculo y fuerza'],
      ['endurance', 'Resistencia'],
      ['recovery', 'Recuperación del entrenamiento'],
    ]],
    'cognitive-health': ['¿Sobre qué parte estás leyendo?', [
      ['focus-clarity', 'Enfoque y claridad'],
      ['memory', 'Memoria'],
      ['mood', 'Ánimo y respuesta al estrés'],
    ]],
    'healing-recovery': ['¿Sobre qué parte estás leyendo?', [
      ['specific-injury', 'Un tejido o articulación específica'],
      ['general-support', 'Investigación general de tejido e inflamación'],
    ]],
    'skin-hair-aesthetics': ['¿Sobre qué parte estás leyendo?', [
      ['skin', 'Piel'],
      ['hair', 'Cabello'],
    ]],
    'sleep-stress': ['¿Sobre qué parte estás leyendo?', [
      ['falling-asleep', 'Conciliar el sueño'],
      ['staying-asleep', 'Mantener el sueño'],
      ['general-stress', 'Respuesta al estrés'],
    ]],
  },
};

/* id, area, focus (omitted = matches every answer), tier, name, sum, det, src */
const EXPLORE_COMPOUNDS = {
  en: [
    // ---- Weight & metabolic ----
    {
      id: 'tirzepatide', area: 'weight-loss', tier: 'clinical', name: 'Tirzepatide',
      sum: 'Clinical trials report substantial average weight reduction (16–22%), generally greater than semaglutide in head-to-head comparison.',
      det: 'Phase 3 SURMOUNT-1 (NEJM): average weight reductions of 16.0–22.5% across dose groups over 72 weeks in adults with obesity/overweight, vs. 2.4% with placebo; 89–96% of participants achieved ≥5% body weight reduction vs. 28% on placebo. SURMOUNT-5 (head-to-head vs. semaglutide): −20.2% vs. −13.7% at 72 weeks, tirzepatide showing significantly greater reduction. SURMOUNT-MAINTAIN (The Lancet): continuing tirzepatide (5–15mg) maintained weight loss vs. switching to placebo.',
      src: [
        { t: 'SURMOUNT-1, Lilly/NEJM', u: 'https://investor.lilly.com/news-releases/news-release-details/lillys-surmount-1-results-published-new-england-journal-medicine' },
        { t: 'SURMOUNT-5', u: 'https://www.acc.org/Latest-in-Cardiology/Journal-Scans/2025/07/10/09/09/SURMOUNT-5' },
        { t: 'SURMOUNT-MAINTAIN', u: 'https://www.acc.org/latest-in-cardiology/journal-scans/2026/05/18/18/10/surmount-maintain' },
      ],
    },
    {
      id: 'retatrutide', area: 'weight-loss', focus: ['fat-loss', 'blood-sugar'], tier: 'clinical', name: 'Retatrutide',
      sum: 'Phase 2 trial reports the largest average weight reduction of any compound studied here (up to 24% at 48 weeks), alongside improved cardiometabolic markers.',
      det: 'Phase 2 trial (NEJM): mean weight reduction up to 17.5% at 24 weeks (primary endpoint), up to 24.2% at 48 weeks (secondary endpoint), the largest reported average reduction of any compound in this catalog. Also associated with improvements in blood pressure, triglycerides, LDL/total cholesterol, HbA1c, fasting glucose/insulin. 338-participant randomized, double-blind, placebo-controlled design. Safety profile similar to other incretin-based therapies.',
      src: [
        { t: 'NEJM Phase 2 trial', u: 'https://www.nejm.org/doi/full/10.1056/NEJMoa2301972' },
        { t: 'Lilly announcement', u: 'https://investor.lilly.com/news-releases/news-release-details/lillys-phase-2-retatrutide-results-published-new-england-journal' },
      ],
    },
    {
      id: 'semaglutide', area: 'weight-loss', tier: 'clinical', name: 'Semaglutide',
      sum: 'Two-year trial data shows sustained ~15% average weight loss vs. ~3% on placebo, with GI side effects being the most common tradeoff.',
      det: 'STEP 1 (NEJM): −14.9% body weight vs. −2.4% placebo at 68 weeks; 86.4% achieved ≥5% weight loss vs. 31.5% on placebo. STEP 5 (2-year follow-up, Nature Medicine): −15.2% vs. −2.6% at 104 weeks, sustained over two years. GI side effects (nausea, etc.) more common than placebo (82.2% vs. 53.9%), mostly mild-to-moderate.',
      src: [
        { t: 'STEP 1, NEJM', u: 'https://www.nejm.org/doi/full/10.1056/NEJMoa2032183' },
        { t: 'STEP 5, Nature Medicine', u: 'https://www.nature.com/articles/s41591-022-02026-4' },
      ],
    },
    {
      id: 'cagrilintide', area: 'weight-loss', focus: ['appetite-control', 'fat-loss'], tier: 'clinical', name: 'Cagrilintide',
      sum: 'Monotherapy trials report ~12% average weight loss; combined with semaglutide, most participants achieved 20%+ weight loss in a large Phase 3 trial.',
      det: 'Monotherapy trial (3,417 participants, 68 weeks): 11.8% average weight reduction vs. 2.3% placebo; 31.6% achieved ≥15% weight loss vs. 4.7% on placebo. REDEFINE 1 (combined with semaglutide as "CagriSema"): 60% of participants achieved ≥20% weight loss, 23% achieved ≥30%; also improved blood pressure, waist circumference, lipids, glycemic control (88% of prediabetic participants returned to normoglycemia). Distinct mechanism from GLP-1s: an amylin analog, targeting satiety via a different pathway.',
      src: [
        { t: 'REDEFINE 1', u: 'https://www.appliedclinicaltrialsonline.com/view/cagrilintide-semaglutide-weight-loss' },
        { t: 'Monotherapy trial', u: 'https://www.patientcareonline.com/view/amylin-injectable-cagrilintide-demonstrates-weight-loss-of-11-8-in-late-stage-trial-novo-nordisk-update' },
      ],
    },
    {
      id: 'aod-9604', area: 'weight-loss', focus: ['fat-loss'], tier: 'clinical', name: 'AOD-9604',
      sum: 'An early trial reported modest fat-specific loss; a larger follow-up trial found no significant effect, and development was discontinued in 2007.',
      det: 'A 12-week, 300-participant trial found a modest average loss of 2.6kg vs. 0.8kg placebo (fat-specific, sparing lean mass), but a larger, longer 24-week trial of 536 participants found no significant weight reduction, and development was discontinued in 2007. Never received FDA approval for any indication.',
      src: [
        { t: 'TrimRX evidence review', u: 'https://trimrx.com/blog/aod-9604-research-review/' },
        { t: 'Peptides Insider', u: 'https://peptidesinsider.com/blog/aod-9604-fat-loss-research' },
      ],
    },
    {
      id: '5-amino-1mq', area: 'weight-loss', focus: ['fat-loss'], tier: 'community', name: '5-Amino-1MQ',
      sum: 'Evidence to date is entirely preclinical, from mouse research. Any weight-loss figure quoted for this compound comes from animal models rather than people.',
      det: 'The evidence base is entirely preclinical: efficacy and safety data come from animal models, and the compound is sold as an unregulated research chemical with no regulatory approval. Mouse studies (diet-induced-obese mice, NNMT inhibition) reported reduced body weight and fat mass without reduced food intake, plus lower cholesterol. Vendor dosing guidance is extrapolated from that animal data.',
      src: [
        { t: 'Weight Loss Rankings evidence review', u: 'https://www.weightlossrankings.org/research/5-amino-1mq-weight-loss-evidence' },
        { t: 'Peptides:Enhanced review', u: 'https://www.peptides-enhanced.com/blog/5-amino-1mq-nnmt-inhibitor-research-review' },
      ],
    },

    // ---- Longevity ----
    {
      id: 'nad-plus', area: 'longevity', tier: 'clinical', name: 'NAD+',
      sum: 'Trials consistently show NAD+ boosting is safe and reliably raises NAD+ levels. Evidence that this translates into a measurable anti-aging benefit is still limited and mixed.',
      det: 'Over a dozen human trials (up to 26 weeks, one 2-year study) consistently show NAD+ precursors are safe and well-tolerated, and reliably raise blood NAD+ levels (roughly 2x after 14 days of NR/NMN supplementation). Evidence for the anti-aging benefit this is meant to produce is weaker than the safety data: one trial found no cognitive improvement over placebo, and a broader review found "clear evidence for antiaging effects... is still scarce," with some limited efficacy shown for metabolic health and skin cancer incidence specifically.',
      src: [
        { t: 'NMN human trials review, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10721522/' },
        { t: 'NR supplementation study, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5876407/' },
        { t: 'Cognition RCT', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12762572/' },
      ],
    },
    {
      id: 'ss-31', area: 'longevity', tier: 'clinical', name: 'SS-31 (Elamipretide)',
      sum: 'Real clinical trials exist and show benefit, specifically in people with diagnosed mitochondrial disease. Trials in broader populations (heart failure, general myopathy) did not meet their endpoints.',
      det: '18 human clinical trials have been run. Real successes exist, specifically in people with defined mitochondrial disease: patients with primary mitochondrial myopathy showed a dose-dependent improvement on the 6-Minute Walk Test (51.2m improvement vs. 3.0m placebo at the highest dose); 48-week treatment in Barth syndrome improved walk-test performance, symptom scores, and heart physiology. Trials in heart failure and general mitochondrial myopathy populations did not meet their endpoints. Important caveat: the positive results are specific to rare, diagnosed mitochondrial disease populations, and apply to those populations; a generally healthy person is a different context.',
      src: [
        { t: 'Elamipretide review, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11816484/' },
        { t: 'Peptide evidence score', u: 'https://biomeme.com/applications/wellness/peptide-evidence/ss-31/' },
      ],
    },
    {
      id: 'epithalon', area: 'longevity', tier: 'community', name: 'Epithalon',
      sum: 'Human cell research (rather than living-patient trials) shows the compound can activate telomerase in a lab setting. Evidence in living people remains to be established through controlled trials.',
      det: 'Developed in Russia by Khavinson\'s lab and studied for over 30 years there. Real human-derived research exists: Epithalon increased telomerase activity in lymphocytes taken from human donors aged 25–88. That is cell-culture research using human-derived cells, so it measures activity in the dish rather than an outcome in a living person. Large-scale randomized human trials remain to be run, and the compound has yet to go through Western regulatory testing.',
      src: [
        { t: 'PubMed, telomerase induction study', u: 'https://pubmed.ncbi.nlm.nih.gov/12937682/' },
        { t: 'Healthspan evidence review', u: 'https://www.gethealthspan.com/research/article/epitalon' },
      ],
    },
    {
      id: 'mots-c', area: 'longevity', tier: 'community', name: 'MOTS-c',
      sum: 'Human studies show MOTS-c naturally correlates with better metabolic markers and rises with exercise. The human data describes MOTS-c as the body produces it; testing it as an administered compound is still an open question.',
      det: 'Human research exists and is observational rather than a treatment trial: exercise raises circulating MOTS-c levels in humans; lower plasma MOTS-c correlates with higher fasting insulin, HbA1c, and BMI; levels are lower in Type 1 diabetes patients and in obese children. The human evidence therefore describes what MOTS-c does naturally in the body. Whether administering it reproduces those associations remains an open question.',
      src: [
        { t: 'MOTS-c review, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9905433/' },
        { t: 'Metabolic correlation meta-analysis', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11331736/' },
      ],
    },

    // ---- Cognitive ----
    {
      id: 'semax', area: 'cognitive-health', focus: ['focus-clarity', 'memory'], tier: 'clinical', name: 'Semax',
      sum: 'Approved in Russia for stroke and brain-injury recovery based on real clinical trials there; smaller studies in healthy volunteers show attention and memory improvements. The findings await independent Western replication.',
      det: 'Semax holds Russian pharmaceutical approval for acute ischemic stroke, traumatic brain injury, optic nerve pathology, and cognitive enhancement in organic brain dysfunction. A 110-patient trial (Gusev et al., 2018) found intranasal Semax raised BDNF and improved motor/functional recovery scores over ~5 months in post-stroke patients; an earlier controlled trial (Gusev et al., 2001) found it accelerated neurological recovery after acute ischemic stroke. In healthy volunteers, doses of 250–1000mcg/kg improved attention and short-term memory with EEG changes similar to other neuroprotective drugs. Caveat: this evidence comes from Russian trials awaiting independent Western replication, and much of it involves stroke and brain-injury patients; a healthy adult is a different context.',
      src: [
        { t: 'Gusev et al. stroke trial', u: 'https://www.researchgate.net/publication/237217244_Synthetic_ACTH_analogue_Semax_displays_nootropic-like_activity_in_humans' },
        { t: 'Cognitive Vitality review', u: 'https://www.alzdiscovery.org/uploads/cognitive_vitality_media/Semax-Cognitive-Vitality-For-Researchers.pdf' },
      ],
    },
    {
      id: 'selank', area: 'cognitive-health', focus: ['focus-clarity', 'mood'], tier: 'clinical', name: 'Selank',
      sum: 'Russian clinical studies (800+ patients across trials) report anxiety relief comparable to benzodiazepines, without the sedation or dependence risk. Large Western RCTs are still to come.',
      det: 'Reported across trials totaling 800+ patients, with anxiolytic effects described as comparable to benzodiazepines (e.g. vs. medazepam, vs. phenazepam) while leaving sedation, cognitive impairment and dependence out of the profile. Standardized anxiety scales (Hamilton Anxiety Rating Scale) and physiological stress markers (blood pressure, cortisol) reportedly improved vs. placebo. Caveat: large-scale, Western-style randomized controlled trials remain to be published; the evidence is Russian-language, smaller-sample research.',
      src: [
        { t: 'Selank anxiety research review', u: 'https://peptideslabuk.com/selank-anxiety-research-what-studies-show/' },
        { t: 'GABAergic mechanism study, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5328971/' },
      ],
    },
    {
      id: 'cerebrolysin', area: 'cognitive-health', focus: ['memory', 'focus-clarity'], tier: 'clinical', name: 'Cerebrolysin',
      sum: 'A large meta-analysis (14 RCTs, ~2,900 patients) shows real stroke-recovery benefit, while a major 2012 trial found the benefit unclear in stroke generally. The evidence is genuinely mixed.',
      det: 'A meta-analysis of 14 randomized controlled trials (2,884 patients) found significantly improved neurological recovery after acute ischemic stroke vs. placebo, and upper-limb motor recovery improved within 3 weeks (sustained at 90 days). A large 2012 trial cast doubt on its usefulness in stroke generally, except perhaps in severe cases, and functional-independence outcomes showed only a non-significant trend favoring it. Separately, a schizophrenia-patient trial found improved cognition/memory, and an older-adult memory-loss trial found improved memory alongside unchanged verbal fluency. Whether it prevents dementia or slows general cognitive decline remains an open question.',
      src: [
        { t: '14-RCT meta-analysis, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12465088/' },
        { t: 'Cognitive Vitality review', u: 'https://www.alzdiscovery.org/cognitive-vitality/ratings/cerebrolysin' },
      ],
    },

    // ---- Physical performance ----
    {
      id: 'cjc-1295-ipamorelin-blend', area: 'physical-performance', focus: ['muscle-strength'], tier: 'clinical', name: 'CJC-1295 (No DAC) + Ipamorelin',
      sum: 'Human trials confirm this reliably raises growth hormone and IGF-1 for days at a time. What those trials measured is the hormone response; the downstream effect on muscle, strength and recovery is still an open question, and the pairing has been studied as two separate compounds rather than as a combination.',
      det: 'Two randomized, placebo-controlled, double-blind human trials (28 and 49 days) found single/multiple CJC-1295 doses produced dose-dependent GH increases (2–10x) lasting 6+ days and IGF-1 increases (1.5–3x) lasting up to 28 days after repeated dosing. Important caveat: these trials measured hormone levels, so muscle growth, strength and body composition remain untested endpoints; raising GH/IGF-1 is a different claim from a proven strength result. The combined CJC-1295+Ipamorelin stack that is commonly used has been studied as its two separate compounds. The combination\'s rationale (complementary GH-release pathways) is mechanistic reasoning drawn from those individual trials.',
      src: [
        { t: 'CJC-1295 endocrine trial, JCEM', u: 'https://academic.oup.com/jcem/article-abstract/91/3/799/2843281' },
        { t: 'Research review', u: 'https://springfieldptwellness.com/cjc-1295-and-ipamorelin-what-the-research-says-about-these-growth-hormone-peptides/' },
      ],
    },
    {
      id: 'ipamorelin', area: 'physical-performance', focus: ['muscle-strength', 'recovery'], tier: 'clinical', name: 'Ipamorelin',
      sum: 'Confirmed in human trials to raise growth hormone cleanly and briefly. The trials measured the hormone response; effects on muscle, sleep and recovery remain untested endpoints.',
      det: 'A randomized, double-blind, placebo-controlled human trial confirmed Ipamorelin sharply raises GH (peaking ~40 minutes post-dose, back to low levels by 6 hours) with a cleaner side-effect profile than older secretagogues like GHRP-6, leaving cortisol, prolactin and appetite largely unchanged. Trials to date have measured the hormone response itself, so body composition, sleep quality and recovery remain untested endpoints. It holds no FDA approval for any indication, and existing human data is small-scale and short-term.',
      src: [
        { t: 'Ipamorelin PK trial', u: 'https://scispace.com/pdf/ipamorelin-the-first-selective-growth-hormone-secretagogue-1t1xkfpaeo.pdf' },
        { t: 'Evidence guide', u: 'https://chia.health/blog/ipamorelin-growth-hormone-peptide-guide' },
      ],
    },
    {
      id: 'ghrp-6', area: 'physical-performance', focus: ['muscle-strength'], tier: 'clinical', name: 'GHRP-6',
      sum: 'Reliably raises growth hormone in human studies and is used as a diagnostic test for GH deficiency. Its anabolic and anti-aging applications remain unconfirmed after decades of research, and it holds no regulatory approval.',
      det: 'Human studies confirm GHRP-6 reliably stimulates GH release (used alongside GHRH as a validated diagnostic test for adult GH deficiency). Despite reproducible GH-stimulating effects, "the clinical use of GHRP as orally active growth-promoting agents and anabolic anti-aging drugs remains to be confirmed": early enthusiasm for it as a GH-replacement alternative was not borne out in further research. It holds no clinical approval, and the available human safety data is short-term.',
      src: [
        { t: 'GHRP-6 mechanism study, JCEM', u: 'https://academic.oup.com/jcem/article-abstract/83/4/1186/2865313' },
        { t: 'Research review', u: 'https://peptideinsight.com/en/peptides/ghrp-6' },
      ],
    },
    {
      id: 'tesamorelin', area: 'physical-performance', tier: 'clinical', name: 'Tesamorelin',
      sum: 'FDA-approved on strong trial data, specifically for visceral fat in HIV-associated lipodystrophy. That is a real, well-proven effect in a population quite different from general fitness use.',
      det: 'The first FDA-approved GHRH analog, approved specifically for reducing visceral fat in HIV-associated lipodystrophy. Two Phase III trials (816 participants, 543 on drug during the 26-week placebo-controlled period) found 15–17% reductions in visceral abdominal fat by CT scan vs. placebo, with the effect specific to visceral fat rather than subcutaneous fat, limb fat, or overall body weight. Caveat: FDA approval covers HIV-associated lipodystrophy only. General fitness and performance use sits outside what the approval and trials establish.',
      src: [
        { t: 'NEJM Phase III trial', u: 'https://www.nejm.org/doi/full/10.1056/NEJMoa072375' },
        { t: 'FDA approval coverage', u: 'https://i-base.info/htb/14188' },
      ],
    },
    {
      id: 'igf-1-lr3', area: 'physical-performance', focus: ['muscle-strength'], tier: 'community', name: 'IGF-1 LR3',
      sum: 'Cell-level research supports the mechanism, and native IGF-1 has real human data in a medical context. Evidence for this specific long-acting analog, as it is actually used, remains preclinical.',
      det: 'Human muscle-cell models show IGF-1 LR3 activates the Akt/mTOR pathway (increasing protein synthesis and myotube hypertrophy), and native IGF-1 studies in HIV-associated muscle wasting show meaningful lean-mass preservation. Human clinical evidence specific to IGF-1 LR3, the long-acting analog sold as a research compound, remains preclinical. Most real-world use in bodybuilding and athletic communities extrapolates from studies of native IGF-1. It holds no FDA approval for human use.',
      src: [
        { t: 'Muscle cell model research', u: 'https://www.pinnaclepeptides.com/blog/post/igf1-lr3-in-muscle-growth-and-cellular-repair' },
        { t: 'Research profile', u: 'https://www.peptidesinstitute.org/peptides/igf-1-lr3' },
      ],
    },
    {
      id: 'follistatin', area: 'physical-performance', focus: ['muscle-strength'], tier: 'community', name: 'Follistatin (FST)',
      sum: 'The single human trial used gene-therapy delivery in six muscular dystrophy patients, a different route and population from the injectable peptide. Muscle-mass evidence beyond that comes from mouse studies.',
      det: 'A proof-of-principle trial delivered follistatin via gene therapy (AAV1.CMV.FS344 injected directly into the quadriceps) to six Becker muscular dystrophy patients, measuring walking-distance improvement, with no abnormal safety findings across monitored organ systems. Two important caveats: the trial used gene-therapy delivery rather than the injectable peptide sold in this catalog, and it studied six patients with a specific muscular dystrophy rather than general muscle-building in healthy adults. Broader evidence (increased strength and muscle mass) comes from mouse studies.',
      src: [
        { t: 'BMD gene therapy trial context', u: 'https://minicircle.io/our-therapies/follistatin/' },
        { t: 'Mouse myostatin inhibition study, PNAS', u: 'https://www.pnas.org/doi/10.1073/pnas.0709144105' },
      ],
    },

    // ---- Healing & recovery ----
    {
      id: 'ghk-cu', area: 'healing-recovery', focus: ['general-support'], tier: 'clinical', name: 'GHK-Cu',
      sum: 'Genuinely strong, repeated clinical trial evidence for wound healing and scar reduction in humans: one of the best-evidenced compounds in this catalog, with completed human trials behind it.',
      det: 'The best-evidenced compound in this category. A current Phase 2 randomized, double-blind, vehicle-controlled trial (ClinicalTrials.gov) is testing topical GHK-Cu gel on standardized skin wounds in healthy adults. Completed human studies: a 2023 Phase 2 trial in 40 post-surgical patients found 0.5% GHK-Cu gel reduced scar volume by 35% at 3 months vs. silicone (statistically significant, p=0.002); a 2021 RCT in 72 diabetic ulcer patients found 85% wound closure at 12 weeks with GHK-Cu dressings vs. 55% control; a human comparison trial found topical GHK-Cu increased collagen in 70% of volunteers, outperforming both vitamin C and retinoic acid comparators. Chronic venous ulcer trials also show accelerated healing and granulation tissue formation vs. placebo.',
      src: [
        { t: 'Current Phase 2 trial, ClinicalTrials.gov', u: 'https://clinicaltrials.gov/study/NCT07437586' },
        { t: 'Tripeptide wound healing review', u: 'https://www.medsci.org/v22p4175.htm' },
      ],
    },
    {
      id: 'bpc-157', area: 'healing-recovery', tier: 'community', name: 'BPC-157',
      sum: 'Has real human trial data for an inflammatory gut condition. For the injury and tendon healing it is typically associated with, the evidence to date is preclinical: 100+ animal studies plus one small observational report.',
      det: 'Important distinction: BPC-157 does have real human trial data. A Phase 2 trial for ulcerative colitis (Croatia) found statistically significant dose-dependent improvement in endoscopic/clinical scores, and Croatian trials in the early 2000s found it safe and effective for inflammatory bowel disease. The injury, tendon and muscle healing use that represents the majority of how people actually use this compound rests on preclinical evidence: 100+ animal studies plus one small, low-quality observational study (7 of 12 people with chronic knee pain reported relief 6+ months after one injection). Human safety data covers the gut-condition trials; the injury-recovery use case remains preclinical.',
      src: [
        { t: 'Human trial evidence review', u: 'https://www.telehealthally.com/guides/bpc-157-human-trial-evidence-guide' },
        { t: 'Evidence-gap analysis', u: 'https://wellfounded.health/insights/bpc-157-and-the-difference-between-an-evidence-gap-and-a-cover-up' },
      ],
    },
    {
      id: 'tb-500', area: 'healing-recovery', focus: ['general-support'], tier: 'community', name: 'TB-500',
      sum: 'The human trial data commonly cited for this compound comes from full-length Thymosin Beta-4, a related but larger molecule applied topically. Evidence for TB-500 itself, the 17-amino-acid fragment sold as a peptide, is preclinical.',
      det: 'Critical distinction: as of this research, evidence for TB-500 (the 17-amino-acid fragment sold as a peptide) is preclinical across every tissue-repair indication. The human clinical trial data that does exist (two Phase 2 trials in venous stasis ulcers and pressure ulcers, showing healing accelerated by nearly a month, safe and well-tolerated) used full-length Thymosin Beta-4, a related but larger molecule, applied topically. Preclinical (animal and cell) research on Tβ4 broadly supports accelerated wound healing mechanisms; whether TB-500 specifically, as an injected peptide, reproduces that effect is still an open question.',
      src: [
        { t: 'TB-500 vs. Tβ4 evidence review', u: 'https://www.jeffreypengmd.com/post/tb-500-for-injury-recovery-what-the-research-actually-shows' },
        { t: 'Clinical profile', u: 'https://deltapeptides.com/tb-500' },
      ],
    },
    {
      id: 'kpv', area: 'healing-recovery', focus: ['general-support'], tier: 'community', name: 'KPV (Alpha-MSH Fragment)',
      sum: 'A well-understood anti-inflammatory mechanism, with an evidence base that is entirely preclinical: animal models and laboratory research.',
      det: 'A tripeptide derived from alpha-MSH with a well-studied anti-inflammatory mechanism (blocks NF-kB signaling, reducing nuclear translocation by up to 80% in lab models). Anti-inflammatory effects are documented in animal models of colitis and peritonitis. The evidence base is preclinical: animal models and laboratory research.',
      src: [
        { t: 'Mechanism study, PubMed', u: 'https://pubmed.ncbi.nlm.nih.gov/12750433/' },
        { t: 'Alpha-MSH peptide review, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4130143/' },
      ],
    },

    // ---- Immune ----
    {
      id: 'thymosin-alpha-1', area: 'immune-support', tier: 'clinical', name: 'Thymosin Alpha-1',
      sum: 'Extensively studied (11,000+ subjects) with real, strong benefit in specific conditions like hepatitis B, while a large sepsis trial found no benefit. Evidence is condition-specific.',
      det: 'Studied in more than 11,000 human subjects across trials. Real, strong results exist and are specific to particular conditions: a pivotal RCT in chronic hepatitis B found 40.6% complete virological response with a 26-week course vs. 9.4% in controls; a 12-month trial in pulmonary tuberculosis patients with diabetes found significantly better sputum-clearance and lesion-resolution rates alongside increased CD3+/CD4+/NK-cell counts. Results vary by condition: a large Phase 3 sepsis trial (22 centers, China) found no significant benefit on any outcome. Mechanistically, it raises CD4+ T-cell levels and CD4/CD8 ratio, which is why it is studied in immunocompromised populations (HIV, cancer-related immunosuppression, age-related immune decline). Those trial populations are specific; a healthy adult is a different context.',
      src: [
        { t: 'Clinical evidence review', u: 'https://www.peptidejournal.org/research/thymosin-alpha-1-clinical-evidence-review' },
        { t: 'TB/diabetes trial, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8713191/' },
        { t: 'Sepsis trial (TESTS)', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12208829/' },
      ],
    },
    {
      id: 'll-37', area: 'immune-support', tier: 'clinical', name: 'LL-37 (Cathelicidin)',
      sum: 'Real trial data exists, almost entirely for topical wound healing. The antimicrobial and immune mechanisms are well-studied in the lab, with human trials for those broader applications still early.',
      det: 'The most advanced human data is in topical wound healing: a Phase IIb RCT (148 patients) found 28.1% complete wound closure with LL-37 vs. 8.1% placebo in a large-wound subgroup; a smaller RCT in venous leg ulcers also showed improved healing. A Phase I trial tested it via intra-tumoral injection in melanoma, finding acceptable tolerability and variable biological response. Broader immune and antimicrobial mechanisms (disrupting microbial membranes, modulating inflammatory signaling) are well-documented in lab research, while "clinical translation remains in its infancy" for those broader applications.',
      src: [
        { t: 'Antimicrobial mechanism review', u: 'https://www.sciencedirect.com/science/article/pii/S156713482500142X' },
        { t: 'Phase IIb wound trial', u: 'https://link.springer.com/article/10.1007/s10989-025-10778-z' },
      ],
    },
    {
      id: 'tymalin', area: 'immune-support', tier: 'clinical', name: 'Tymalin',
      sum: 'Decades of real clinical use and striking long-term mortality data in Eastern European research. That evidence comes from clinical practice there and remains to be independently replicated under Western trial standards.',
      det: 'Developed in the 1970s (the same Khavinson/Morozov lab behind Epithalon) and in clinical use for 40+ years in Russia and Eastern Europe, with regulatory approval in those countries. A notable 2021 study found it improved immune status markers and clinical outcomes in elderly COVID-19 patients. Separately, described as "the longest human clinical trial ever conducted on a therapeutic peptide": a 6-year follow-up in elderly patients reportedly found a 45% reduction in cardiovascular mortality and 28% reduction in all-cause mortality. Also used as adjunct therapy for influenza, hepatitis B/C, herpes simplex, and HIV in the countries where it is used clinically. Independent replication under US/EU regulatory review remains to be done.',
      src: [
        { t: 'COVID-19 immune study', u: 'https://link.springer.com/article/10.1134/S2079057021040068' },
        { t: 'Immunocorrection review', u: 'https://link.springer.com/article/10.1134/S2079086421040046' },
      ],
    },
    {
      id: 'pnc-27', area: 'immune-support', tier: 'community', name: 'PNC-27',
      sum: 'An experimental anti-cancer research compound studied in cell cultures. Its evidence base is preclinical, and its research context is oncology rather than immune support.',
      det: 'Framing note: PNC-27 is a p53-derived experimental compound studied for selectively destroying cancer cell membranes in vitro. Its research context is oncology rather than the immune support this area implies. Research to date is cell-culture level (over 20 human cancer cell lines tested) with limited in vivo (animal) data; human clinical trials remain to be run. It holds no approval for human use from any regulatory authority.',
      src: [
        { t: 'Mechanism review, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9138867/' },
        { t: 'PNAS mechanism study', u: 'https://www.pnas.org/doi/10.1073/pnas.0909364107' },
      ],
    },

    // ---- Skin & hair ----
    {
      id: 'ghk-cu', area: 'skin-hair-aesthetics', focus: ['skin', 'hair'], tier: 'clinical', name: 'GHK-Cu',
      sum: 'Strong, repeated clinical trial evidence for skin and wound healing (see Healing & recovery); smaller human trials also show real improvements in hair count and follicle density with topical use, resting on smaller trials than the skin evidence.',
      det: 'For skin: see the full GHK-Cu entry under Healing & recovery. The scar-reduction, wound-closure and collagen-increase trials there apply directly to the skin and aesthetic use case, extending beyond wound repair to collagen stimulation and visible skin quality. For hair specifically the evidence is real and thinner: a 2016 RCT using a GHK peptide formulation found significant hair-count increases after 6 months of topical use vs. placebo in men with pattern hair loss, and a 2015 study combining GHK-Cu with other hair-active peptides outperformed placebo on follicle density and diameter. The mechanism (VEGF upregulation, TGF-β1 suppression, Wnt/β-catenin activation in dermal papilla cells) is well-characterized in lab research. Honest summary: a well-understood mechanism, positive animal data, and a cluster of smaller positive human studies. Large-scale RCTs remain to be run.',
      src: [
        { t: 'Hair growth evidence review', u: 'https://www.gethealthspan.com/research/article/ghk-cu-hair-growth-evidence-review' },
        { t: 'In vitro hair growth study', u: 'https://www.researchgate.net/publication/6135527_The_effect_of_tripeptide-copper_complex_on_human_hair_growth_in_vitro' },
      ],
    },
    {
      id: 'glow-blend', area: 'skin-hair-aesthetics', focus: ['skin', 'hair'], tier: 'community', name: 'GLOW (GHK-Cu + TB-500 + BPC-157)',
      sum: 'A blend built from individually-researched compounds. Evidence exists for each ingredient on its own; the combination as a whole remains to be trialed.',
      det: 'A combination product (GHK-Cu + TB-500 + BPC-157) built from individually-researched compounds; see each one\'s own entry (GHK-Cu here and under Healing & recovery; BPC-157 and TB-500 under Healing & recovery). This specific combination remains to be trialed as a whole, the same caveat as the CJC-1295+Ipamorelin stack under Physical performance. Confidence in the individual ingredients applies to those ingredients: combining compounds can change absorption, interaction effects and outcomes in ways individual-ingredient trials leave open.',
      src: [],
    },
    {
      id: 'klow-blend', area: 'skin-hair-aesthetics', focus: ['skin', 'hair'], tier: 'community', name: 'KLOW (GHK-Cu + BPC-157 + TB-500 + KPV)',
      sum: 'A blend built from individually-researched compounds. Evidence exists for each ingredient on its own; the combination as a whole remains to be trialed.',
      det: 'A combination product (GHK-Cu + BPC-157 + TB-500 + KPV) built from individually-researched compounds; see each one\'s own entry (GHK-Cu here and under Healing & recovery; BPC-157, TB-500 and KPV under Healing & recovery). This specific combination remains to be trialed as a whole, the same caveat as the CJC-1295+Ipamorelin stack under Physical performance. Confidence in the individual ingredients applies to those ingredients: combining compounds can change absorption, interaction effects and outcomes in ways individual-ingredient trials leave open.',
      src: [],
    },

    // ---- Sleep & stress ----
    {
      id: 'dsip', area: 'sleep-stress', tier: 'clinical', name: 'DSIP',
      sum: 'Real human trials exist and they disagree with each other: some show meaningful sleep improvement, one found the effect minimal compared to placebo. The evidence is genuinely mixed.',
      det: 'Real human trials exist, and results are inconsistent across them. One early trial: 7 severe insomnia patients given 10 DSIP injections had normalized sleep for 3–7 months in all but one case, with improved daytime mood and performance. A separate trial in 6 chronic insomniacs found longer sleep duration, higher sleep quality, fewer interruptions, and slightly more REM sleep with no daytime sedation, though the sleep-promoting effect appeared in the second hour after injection (a mild arousing effect showed in the first hour). Another controlled trial found total sleep time increased while nighttime awakenings tracked placebo, concluding the clinical significance was minimal. Overall assessment from research reviewers: "clinical research remains limited and somewhat controversial."',
      src: [
        { t: 'Early insomnia trial, PubMed', u: 'https://pubmed.ncbi.nlm.nih.gov/3583493/' },
        { t: 'Disturbed sleep trial, PubMed', u: 'https://pubmed.ncbi.nlm.nih.gov/7028502/' },
      ],
    },
    {
      id: 'neuro-calm-pm', area: 'sleep-stress', tier: 'community', name: 'NEURO-CALM PM (blend)',
      sum: 'A blend product whose combination remains to be trialed as a whole. Evidence comes from its individual ingredients, researched separately.',
      det: 'A combination blend; individual components should be researched on their own merits (this catalog entry does not specify a composition that maps cleanly to the already-researched single compounds in this document). As with other blends (GLOW/KLOW, CJC-1295+Ipamorelin), this specific combination remains to be trialed; treat the blend itself as community-tier regardless of any individual ingredient\'s own evidence.',
      src: [],
    },

    // ---- Sexual wellness ----
    {
      id: 'pt-141', area: 'sexual-wellness', tier: 'clinical', name: 'PT-141 (Bremelanotide)',
      sum: 'Genuinely FDA-approved with solid trial data (1,200+ women). The approval is specifically for a diagnosed desire disorder in premenopausal women, and there it improved desire scores while the count of satisfying sexual events, a key trial endpoint, stayed close to placebo.',
      det: 'FDA-approved (as Vyleesi®, June 2019) for acquired, generalized hypoactive sexual desire disorder (HSDD) in premenopausal women: the second-ever approved drug for female sexual desire disorder, and the first with a non-hormonal mechanism (acting centrally via MC4R receptors and dopamine pathways, where Viagra and Cialis work on blood flow). Trials included over 1,200 women. Important, specific caveat: it improved desire and desire-related distress scores vs. placebo, while the number of "satisfying sexual events," a key trial endpoint, stayed close to placebo. Nausea was the most common side effect (40% of the treatment group in the RECONNECT trials, resolving within ~3 hours). Used off-label in men for erectile dysfunction and low libido; the FDA approval and the trial population above are specifically premenopausal women with HSDD.',
      src: [
        { t: 'FDA approval coverage', u: 'https://www.theloopway.com/research/pt-141-female-sexual-desire-2019' },
        { t: 'Clinical overview', u: 'https://www.peptides.org/pt-141/' },
      ],
    },
  ],

  es: [
    // ---- Peso y metabolismo ----
    {
      id: 'tirzepatide', area: 'weight-loss', tier: 'clinical', name: 'Tirzepatide',
      sum: 'Los ensayos clínicos reportan una reducción de peso promedio sustancial (16–22%), en general mayor que semaglutide en comparación directa.',
      det: 'Fase 3 SURMOUNT-1 (NEJM): reducciones de peso promedio de 16.0–22.5% entre grupos de dosis a lo largo de 72 semanas en adultos con obesidad o sobrepeso, frente a 2.4% con placebo; 89–96% de los participantes alcanzaron una reducción ≥5% del peso corporal frente a 28% con placebo. SURMOUNT-5 (comparación directa con semaglutide): −20.2% frente a −13.7% a las 72 semanas, con tirzepatide mostrando una reducción significativamente mayor. SURMOUNT-MAINTAIN (The Lancet): continuar con tirzepatide (5–15mg) mantuvo la pérdida de peso frente a cambiar a placebo.',
      src: [
        { t: 'SURMOUNT-1, Lilly/NEJM', u: 'https://investor.lilly.com/news-releases/news-release-details/lillys-surmount-1-results-published-new-england-journal-medicine' },
        { t: 'SURMOUNT-5', u: 'https://www.acc.org/Latest-in-Cardiology/Journal-Scans/2025/07/10/09/09/SURMOUNT-5' },
        { t: 'SURMOUNT-MAINTAIN', u: 'https://www.acc.org/latest-in-cardiology/journal-scans/2026/05/18/18/10/surmount-maintain' },
      ],
    },
    {
      id: 'retatrutide', area: 'weight-loss', focus: ['fat-loss', 'blood-sugar'], tier: 'clinical', name: 'Retatrutide',
      sum: 'Un ensayo de Fase 2 reporta la mayor reducción de peso promedio de todos los compuestos aquí estudiados (hasta 24% a las 48 semanas), junto con mejoras en marcadores cardiometabólicos.',
      det: 'Ensayo de Fase 2 (NEJM): reducción de peso media de hasta 17.5% a las 24 semanas (desenlace primario) y hasta 24.2% a las 48 semanas (desenlace secundario), la mayor reducción promedio reportada de cualquier compuesto de este catálogo. También se asocia con mejoras en presión arterial, triglicéridos, colesterol LDL y total, HbA1c, glucosa e insulina en ayunas. Diseño aleatorizado, doble ciego y controlado con placebo, con 338 participantes. Perfil de seguridad similar al de otras terapias basadas en incretinas.',
      src: [
        { t: 'NEJM Phase 2 trial', u: 'https://www.nejm.org/doi/full/10.1056/NEJMoa2301972' },
        { t: 'Lilly announcement', u: 'https://investor.lilly.com/news-releases/news-release-details/lillys-phase-2-retatrutide-results-published-new-england-journal' },
      ],
    },
    {
      id: 'semaglutide', area: 'weight-loss', tier: 'clinical', name: 'Semaglutide',
      sum: 'Los datos a dos años muestran una pérdida de peso promedio sostenida de ~15% frente a ~3% con placebo, con efectos gastrointestinales como la contrapartida más común.',
      det: 'STEP 1 (NEJM): −14.9% de peso corporal frente a −2.4% con placebo a las 68 semanas; 86.4% alcanzó una pérdida ≥5% frente a 31.5% con placebo. STEP 5 (seguimiento a 2 años, Nature Medicine): −15.2% frente a −2.6% a las 104 semanas, sostenido durante dos años. Los efectos gastrointestinales (náusea, entre otros) fueron más frecuentes que con placebo (82.2% frente a 53.9%), en su mayoría leves a moderados.',
      src: [
        { t: 'STEP 1, NEJM', u: 'https://www.nejm.org/doi/full/10.1056/NEJMoa2032183' },
        { t: 'STEP 5, Nature Medicine', u: 'https://www.nature.com/articles/s41591-022-02026-4' },
      ],
    },
    {
      id: 'cagrilintide', area: 'weight-loss', focus: ['appetite-control', 'fat-loss'], tier: 'clinical', name: 'Cagrilintide',
      sum: 'Los ensayos en monoterapia reportan ~12% de pérdida de peso promedio; combinado con semaglutide, la mayoría de participantes superó el 20% en un ensayo grande de Fase 3.',
      det: 'Ensayo en monoterapia (3,417 participantes, 68 semanas): reducción de peso promedio de 11.8% frente a 2.3% con placebo; 31.6% alcanzó una pérdida ≥15% frente a 4.7% con placebo. REDEFINE 1 (combinado con semaglutide como "CagriSema"): 60% de los participantes alcanzó una pérdida ≥20% y 23% alcanzó ≥30%; también mejoraron presión arterial, circunferencia de cintura, lípidos y control glucémico (88% de los participantes prediabéticos volvió a normoglucemia). Mecanismo distinto al de los GLP-1: es un análogo de amilina que actúa sobre la saciedad por otra vía.',
      src: [
        { t: 'REDEFINE 1', u: 'https://www.appliedclinicaltrialsonline.com/view/cagrilintide-semaglutide-weight-loss' },
        { t: 'Monotherapy trial', u: 'https://www.patientcareonline.com/view/amylin-injectable-cagrilintide-demonstrates-weight-loss-of-11-8-in-late-stage-trial-novo-nordisk-update' },
      ],
    },
    {
      id: 'aod-9604', area: 'weight-loss', focus: ['fat-loss'], tier: 'clinical', name: 'AOD-9604',
      sum: 'Un ensayo temprano reportó una pérdida modesta y específica de grasa; un ensayo de seguimiento más grande no encontró un efecto significativo, y el desarrollo se descontinuó en 2007.',
      det: 'Un ensayo de 12 semanas con 300 participantes encontró una pérdida promedio modesta de 2.6kg frente a 0.8kg con placebo (específica de grasa, preservando masa magra), mientras que un ensayo más grande y más largo, de 24 semanas y 536 participantes, no encontró una reducción de peso significativa, y el desarrollo se descontinuó en 2007. Nunca recibió aprobación de la FDA para ninguna indicación.',
      src: [
        { t: 'TrimRX evidence review', u: 'https://trimrx.com/blog/aod-9604-research-review/' },
        { t: 'Peptides Insider', u: 'https://peptidesinsider.com/blog/aod-9604-fat-loss-research' },
      ],
    },
    {
      id: '5-amino-1mq', area: 'weight-loss', focus: ['fat-loss'], tier: 'community', name: '5-Amino-1MQ',
      sum: 'La evidencia hasta hoy es enteramente preclínica, proveniente de investigación en ratones. Cualquier cifra de pérdida de peso citada para este compuesto viene de modelos animales, no de personas.',
      det: 'La base de evidencia es enteramente preclínica: los datos de eficacia y seguridad provienen de modelos animales, y el compuesto se vende como químico de investigación sin regulación ni aprobación regulatoria. Los estudios en ratones (ratones obesos por dieta, inhibición de NNMT) reportaron menor peso corporal y masa grasa sin reducción en la ingesta de alimento, además de colesterol más bajo. Las guías de dosificación de proveedores se extrapolan de esos datos animales.',
      src: [
        { t: 'Weight Loss Rankings evidence review', u: 'https://www.weightlossrankings.org/research/5-amino-1mq-weight-loss-evidence' },
        { t: 'Peptides:Enhanced review', u: 'https://www.peptides-enhanced.com/blog/5-amino-1mq-nnmt-inhibitor-research-review' },
      ],
    },

    // ---- Longevidad ----
    {
      id: 'nad-plus', area: 'longevity', tier: 'clinical', name: 'NAD+',
      sum: 'Los ensayos muestran de forma consistente que elevar NAD+ es seguro y sube los niveles de manera confiable. La evidencia de que esto se traduzca en un beneficio antienvejecimiento medible sigue siendo limitada y mixta.',
      det: 'Más de una docena de ensayos en humanos (hasta 26 semanas, con un estudio a 2 años) muestran de forma consistente que los precursores de NAD+ son seguros y bien tolerados, y elevan de manera confiable los niveles sanguíneos de NAD+ (aproximadamente al doble tras 14 días de suplementación con NR/NMN). La evidencia del beneficio antienvejecimiento que esto busca producir es más débil que los datos de seguridad: un ensayo no encontró mejora cognitiva frente a placebo, y una revisión más amplia concluyó que "la evidencia clara de efectos antienvejecimiento sigue siendo escasa", con eficacia limitada demostrada específicamente en salud metabólica e incidencia de cáncer de piel.',
      src: [
        { t: 'NMN human trials review, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10721522/' },
        { t: 'NR supplementation study, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5876407/' },
        { t: 'Cognition RCT', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12762572/' },
      ],
    },
    {
      id: 'ss-31', area: 'longevity', tier: 'clinical', name: 'SS-31 (Elamipretide)',
      sum: 'Existen ensayos clínicos reales que muestran beneficio, específicamente en personas con enfermedad mitocondrial diagnosticada. Los ensayos en poblaciones más amplias (insuficiencia cardíaca, miopatía general) no alcanzaron sus desenlaces.',
      det: 'Se han realizado 18 ensayos clínicos en humanos. Existen éxitos reales, específicamente en personas con enfermedad mitocondrial definida: pacientes con miopatía mitocondrial primaria mostraron una mejora dependiente de dosis en la prueba de caminata de 6 minutos (mejora de 51.2m frente a 3.0m con placebo en la dosis más alta); 48 semanas de tratamiento en síndrome de Barth mejoraron el desempeño en la prueba de caminata, las puntuaciones de síntomas y la fisiología cardíaca. Los ensayos en insuficiencia cardíaca y en miopatía mitocondrial general no alcanzaron sus desenlaces. Advertencia importante: los resultados positivos son específicos de poblaciones con enfermedad mitocondrial diagnosticada y poco frecuente, y aplican a esas poblaciones; una persona sana es un contexto distinto.',
      src: [
        { t: 'Elamipretide review, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11816484/' },
        { t: 'Peptide evidence score', u: 'https://biomeme.com/applications/wellness/peptide-evidence/ss-31/' },
      ],
    },
    {
      id: 'epithalon', area: 'longevity', tier: 'community', name: 'Epithalon',
      sum: 'La investigación en células humanas (más que ensayos en pacientes vivos) muestra que el compuesto puede activar la telomerasa en laboratorio. La evidencia en personas vivas está por establecerse mediante ensayos controlados.',
      det: 'Desarrollado en Rusia por el laboratorio de Khavinson y estudiado allí por más de 30 años. Existe investigación real derivada de humanos: Epithalon aumentó la actividad de telomerasa en linfocitos tomados de donantes humanos de 25 a 88 años. Se trata de investigación en cultivo celular usando células de origen humano, de modo que mide actividad en placa más que un desenlace en una persona viva. Los ensayos aleatorizados a gran escala en humanos están por realizarse, y el compuesto aún debe pasar por evaluación regulatoria occidental.',
      src: [
        { t: 'PubMed, telomerase induction study', u: 'https://pubmed.ncbi.nlm.nih.gov/12937682/' },
        { t: 'Healthspan evidence review', u: 'https://www.gethealthspan.com/research/article/epitalon' },
      ],
    },
    {
      id: 'mots-c', area: 'longevity', tier: 'community', name: 'MOTS-c',
      sum: 'Los estudios en humanos muestran que MOTS-c se correlaciona naturalmente con mejores marcadores metabólicos y sube con el ejercicio. Los datos humanos describen MOTS-c tal como el cuerpo lo produce; estudiarlo como compuesto administrado sigue siendo una pregunta abierta.',
      det: 'Existe investigación en humanos, de carácter observacional más que de tratamiento: el ejercicio eleva los niveles circulantes de MOTS-c en humanos; un MOTS-c plasmático más bajo se correlaciona con mayor insulina en ayunas, HbA1c e IMC; los niveles son más bajos en pacientes con diabetes tipo 1 y en niños con obesidad. La evidencia humana describe entonces lo que MOTS-c hace naturalmente en el cuerpo. Si administrarlo reproduce esas asociaciones sigue siendo una pregunta abierta.',
      src: [
        { t: 'MOTS-c review, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9905433/' },
        { t: 'Metabolic correlation meta-analysis', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11331736/' },
      ],
    },

    // ---- Cognitivo ----
    {
      id: 'semax', area: 'cognitive-health', focus: ['focus-clarity', 'memory'], tier: 'clinical', name: 'Semax',
      sum: 'Aprobado en Rusia para recuperación tras ictus y lesión cerebral con base en ensayos clínicos reales realizados allí; estudios más pequeños en voluntarios sanos muestran mejoras en atención y memoria. Los hallazgos esperan replicación occidental independiente.',
      det: 'Semax cuenta con aprobación farmacéutica rusa para ictus isquémico agudo, traumatismo craneoencefálico, patología del nervio óptico y mejora cognitiva en disfunción cerebral orgánica. Un ensayo con 110 pacientes (Gusev et al., 2018) encontró que Semax intranasal elevó el BDNF y mejoró las puntuaciones de recuperación motora y funcional a lo largo de ~5 meses en pacientes post-ictus; un ensayo controlado anterior (Gusev et al., 2001) encontró que aceleró la recuperación neurológica tras un ictus isquémico agudo. En voluntarios sanos, dosis de 250–1000mcg/kg mejoraron la atención y la memoria de corto plazo con cambios en EEG similares a los de otros fármacos neuroprotectores. Advertencia: esta evidencia proviene de ensayos rusos que esperan replicación occidental independiente, y buena parte involucra pacientes con ictus y lesión cerebral; un adulto sano es un contexto distinto.',
      src: [
        { t: 'Gusev et al. stroke trial', u: 'https://www.researchgate.net/publication/237217244_Synthetic_ACTH_analogue_Semax_displays_nootropic-like_activity_in_humans' },
        { t: 'Cognitive Vitality review', u: 'https://www.alzdiscovery.org/uploads/cognitive_vitality_media/Semax-Cognitive-Vitality-For-Researchers.pdf' },
      ],
    },
    {
      id: 'selank', area: 'cognitive-health', focus: ['focus-clarity', 'mood'], tier: 'clinical', name: 'Selank',
      sum: 'Los estudios clínicos rusos (más de 800 pacientes entre ensayos) reportan alivio de ansiedad comparable al de las benzodiacepinas, sin sedación ni riesgo de dependencia. Los grandes ensayos aleatorizados occidentales están por venir.',
      det: 'Reportado en ensayos que suman más de 800 pacientes, con efectos ansiolíticos descritos como comparables a los de las benzodiacepinas (por ejemplo frente a medazepam y a fenazepam), dejando fuera del perfil la sedación, el deterioro cognitivo y la dependencia. Las escalas estandarizadas de ansiedad (Escala de Hamilton) y los marcadores fisiológicos de estrés (presión arterial, cortisol) mejoraron frente a placebo según lo reportado. Advertencia: los ensayos controlados aleatorizados a gran escala, de estilo occidental, están por publicarse; la evidencia es investigación en ruso, con muestras más pequeñas.',
      src: [
        { t: 'Selank anxiety research review', u: 'https://peptideslabuk.com/selank-anxiety-research-what-studies-show/' },
        { t: 'GABAergic mechanism study, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5328971/' },
      ],
    },
    {
      id: 'cerebrolysin', area: 'cognitive-health', focus: ['memory', 'focus-clarity'], tier: 'clinical', name: 'Cerebrolysin',
      sum: 'Un metaanálisis grande (14 ensayos aleatorizados, ~2,900 pacientes) muestra beneficio real en recuperación tras ictus, mientras que un ensayo importante de 2012 encontró el beneficio poco claro en ictus en general. La evidencia es genuinamente mixta.',
      det: 'Un metaanálisis de 14 ensayos controlados aleatorizados (2,884 pacientes) encontró una mejora significativa en la recuperación neurológica tras un ictus isquémico agudo frente a placebo, y la recuperación motora de extremidad superior mejoró en 3 semanas (sostenida a los 90 días). Un ensayo grande de 2012 puso en duda su utilidad en ictus en general, salvo quizá en casos graves, y los desenlaces de independencia funcional mostraron solo una tendencia no significativa a su favor. Por separado, un ensayo en pacientes con esquizofrenia encontró mejora en cognición y memoria, y un ensayo en adultos mayores con pérdida de memoria encontró memoria mejorada junto con fluidez verbal sin cambios. Si previene la demencia o retrasa el deterioro cognitivo general sigue siendo una pregunta abierta.',
      src: [
        { t: '14-RCT meta-analysis, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12465088/' },
        { t: 'Cognitive Vitality review', u: 'https://www.alzdiscovery.org/cognitive-vitality/ratings/cerebrolysin' },
      ],
    },

    // ---- Rendimiento físico ----
    {
      id: 'cjc-1295-ipamorelin-blend', area: 'physical-performance', focus: ['muscle-strength'], tier: 'clinical', name: 'CJC-1295 (No DAC) + Ipamorelin',
      sum: 'Los ensayos en humanos confirman que eleva de forma confiable la hormona de crecimiento y el IGF-1 durante días. Lo que esos ensayos midieron es la respuesta hormonal; el efecto posterior sobre músculo, fuerza y recuperación sigue siendo una pregunta abierta, y la combinación se ha estudiado como dos compuestos separados más que como mezcla.',
      det: 'Dos ensayos en humanos aleatorizados, controlados con placebo y doble ciego (28 y 49 días) encontraron que dosis únicas y múltiples de CJC-1295 produjeron aumentos de GH dependientes de dosis (2 a 10 veces) que duraron más de 6 días, y aumentos de IGF-1 (1.5 a 3 veces) que duraron hasta 28 días tras dosificación repetida. Advertencia importante: estos ensayos midieron niveles hormonales, de modo que el crecimiento muscular, la fuerza y la composición corporal siguen siendo desenlaces sin evaluar; elevar GH e IGF-1 es una afirmación distinta a un resultado demostrado de fuerza. La combinación CJC-1295+Ipamorelin de uso común se ha estudiado como sus dos compuestos por separado. El razonamiento de la combinación (vías complementarias de liberación de GH) es mecanístico y se apoya en esos ensayos individuales.',
      src: [
        { t: 'CJC-1295 endocrine trial, JCEM', u: 'https://academic.oup.com/jcem/article-abstract/91/3/799/2843281' },
        { t: 'Research review', u: 'https://springfieldptwellness.com/cjc-1295-and-ipamorelin-what-the-research-says-about-these-growth-hormone-peptides/' },
      ],
    },
    {
      id: 'ipamorelin', area: 'physical-performance', focus: ['muscle-strength', 'recovery'], tier: 'clinical', name: 'Ipamorelin',
      sum: 'Confirmado en ensayos en humanos para elevar la hormona de crecimiento de forma limpia y breve. Los ensayos midieron la respuesta hormonal; los efectos sobre músculo, sueño y recuperación siguen siendo desenlaces sin evaluar.',
      det: 'Un ensayo en humanos aleatorizado, doble ciego y controlado con placebo confirmó que Ipamorelin eleva marcadamente la GH (con pico ~40 minutos tras la dosis y regreso a niveles bajos a las 6 horas), con un perfil de efectos secundarios más limpio que el de secretagogos antiguos como GHRP-6, dejando cortisol, prolactina y apetito prácticamente sin cambios. Los ensayos hasta hoy han medido la respuesta hormonal en sí, de modo que composición corporal, calidad del sueño y recuperación siguen siendo desenlaces sin evaluar. No cuenta con aprobación de la FDA para ninguna indicación, y los datos humanos existentes son de escala pequeña y corto plazo.',
      src: [
        { t: 'Ipamorelin PK trial', u: 'https://scispace.com/pdf/ipamorelin-the-first-selective-growth-hormone-secretagogue-1t1xkfpaeo.pdf' },
        { t: 'Evidence guide', u: 'https://chia.health/blog/ipamorelin-growth-hormone-peptide-guide' },
      ],
    },
    {
      id: 'ghrp-6', area: 'physical-performance', focus: ['muscle-strength'], tier: 'clinical', name: 'GHRP-6',
      sum: 'Eleva de forma confiable la hormona de crecimiento en estudios humanos y se usa como prueba diagnóstica de deficiencia de GH. Sus aplicaciones anabólicas y antienvejecimiento siguen sin confirmarse tras décadas de investigación, y no cuenta con aprobación regulatoria.',
      det: 'Los estudios en humanos confirman que GHRP-6 estimula de forma confiable la liberación de GH (se usa junto con GHRH como prueba diagnóstica validada de deficiencia de GH en adultos). Pese a efectos estimulantes de GH reproducibles, "el uso clínico de los GHRP como agentes promotores del crecimiento por vía oral y como fármacos anabólicos antienvejecimiento está por confirmarse": el entusiasmo temprano por su uso como alternativa al reemplazo de GH no se sostuvo en investigación posterior. No cuenta con aprobación clínica, y los datos humanos de seguridad disponibles son de corto plazo.',
      src: [
        { t: 'GHRP-6 mechanism study, JCEM', u: 'https://academic.oup.com/jcem/article-abstract/83/4/1186/2865313' },
        { t: 'Research review', u: 'https://peptideinsight.com/en/peptides/ghrp-6' },
      ],
    },
    {
      id: 'tesamorelin', area: 'physical-performance', tier: 'clinical', name: 'Tesamorelin',
      sum: 'Aprobado por la FDA con datos sólidos de ensayos, específicamente para grasa visceral en lipodistrofia asociada al VIH. Es un efecto real y bien demostrado en una población bastante distinta a la del uso general en fitness.',
      det: 'El primer análogo de GHRH aprobado por la FDA, autorizado específicamente para reducir grasa visceral en lipodistrofia asociada al VIH. Dos ensayos de Fase III (816 participantes, 543 con el fármaco durante el período de 26 semanas controlado con placebo) encontraron reducciones de 15–17% en grasa abdominal visceral por tomografía frente a placebo, con el efecto específico a la grasa visceral más que a grasa subcutánea, grasa de extremidades o peso corporal total. Advertencia: la aprobación de la FDA cubre únicamente la lipodistrofia asociada al VIH. El uso general en fitness y rendimiento queda fuera de lo que la aprobación y los ensayos establecen.',
      src: [
        { t: 'NEJM Phase III trial', u: 'https://www.nejm.org/doi/full/10.1056/NEJMoa072375' },
        { t: 'FDA approval coverage', u: 'https://i-base.info/htb/14188' },
      ],
    },
    {
      id: 'igf-1-lr3', area: 'physical-performance', focus: ['muscle-strength'], tier: 'community', name: 'IGF-1 LR3',
      sum: 'La investigación a nivel celular respalda el mecanismo, y el IGF-1 nativo tiene datos humanos reales en contexto médico. La evidencia de este análogo de acción prolongada, tal como se usa realmente, sigue siendo preclínica.',
      det: 'Los modelos de células musculares humanas muestran que IGF-1 LR3 activa la vía Akt/mTOR (aumentando la síntesis proteica y la hipertrofia de miotubos), y los estudios de IGF-1 nativo en desgaste muscular asociado al VIH muestran una preservación significativa de masa magra. La evidencia clínica humana específica de IGF-1 LR3, el análogo de acción prolongada vendido como compuesto de investigación, sigue siendo preclínica. La mayoría del uso real en comunidades de fisicoculturismo y deporte se extrapola de estudios del IGF-1 nativo. No cuenta con aprobación de la FDA para uso humano.',
      src: [
        { t: 'Muscle cell model research', u: 'https://www.pinnaclepeptides.com/blog/post/igf1-lr3-in-muscle-growth-and-cellular-repair' },
        { t: 'Research profile', u: 'https://www.peptidesinstitute.org/peptides/igf-1-lr3' },
      ],
    },
    {
      id: 'follistatin', area: 'physical-performance', focus: ['muscle-strength'], tier: 'community', name: 'Follistatin (FST)',
      sum: 'El único ensayo en humanos usó terapia génica en seis pacientes con distrofia muscular, una vía de administración y una población distintas a las del péptido inyectable. La evidencia de masa muscular más allá de eso viene de estudios en ratones.',
      det: 'Un ensayo de prueba de concepto administró folistatina mediante terapia génica (AAV1.CMV.FS344 inyectado directamente en el cuádriceps) a seis pacientes con distrofia muscular de Becker, midiendo la mejora en distancia de marcha, sin hallazgos anormales de seguridad en los sistemas orgánicos monitoreados. Dos advertencias importantes: el ensayo usó administración por terapia génica más que el péptido inyectable vendido en este catálogo, y estudió a seis pacientes con una distrofia muscular específica más que el desarrollo muscular general en adultos sanos. La evidencia más amplia (mayor fuerza y masa muscular) proviene de estudios en ratones.',
      src: [
        { t: 'BMD gene therapy trial context', u: 'https://minicircle.io/our-therapies/follistatin/' },
        { t: 'Mouse myostatin inhibition study, PNAS', u: 'https://www.pnas.org/doi/10.1073/pnas.0709144105' },
      ],
    },

    // ---- Reparación y recuperación ----
    {
      id: 'ghk-cu', area: 'healing-recovery', focus: ['general-support'], tier: 'clinical', name: 'GHK-Cu',
      sum: 'Evidencia genuinamente sólida y repetida de ensayos clínicos en cicatrización de heridas y reducción de cicatrices en humanos: uno de los compuestos mejor documentados de este catálogo, con ensayos en humanos completados.',
      det: 'El compuesto con mejor evidencia de esta categoría. Un ensayo actual de Fase 2, aleatorizado, doble ciego y controlado con vehículo (ClinicalTrials.gov) está evaluando gel tópico de GHK-Cu en heridas cutáneas estandarizadas en adultos sanos. Estudios humanos completados: un ensayo de Fase 2 de 2023 en 40 pacientes posquirúrgicos encontró que el gel de GHK-Cu al 0.5% redujo el volumen de cicatriz en 35% a los 3 meses frente a silicona (estadísticamente significativo, p=0.002); un ensayo aleatorizado de 2021 en 72 pacientes con úlcera diabética encontró 85% de cierre de herida a las 12 semanas con apósitos de GHK-Cu frente a 55% en control; un ensayo comparativo en humanos encontró que el GHK-Cu tópico aumentó el colágeno en 70% de los voluntarios, superando tanto a la vitamina C como al ácido retinoico como comparadores. Los ensayos en úlcera venosa crónica también muestran cicatrización acelerada y formación de tejido de granulación frente a placebo.',
      src: [
        { t: 'Current Phase 2 trial, ClinicalTrials.gov', u: 'https://clinicaltrials.gov/study/NCT07437586' },
        { t: 'Tripeptide wound healing review', u: 'https://www.medsci.org/v22p4175.htm' },
      ],
    },
    {
      id: 'bpc-157', area: 'healing-recovery', tier: 'community', name: 'BPC-157',
      sum: 'Tiene datos reales de ensayos en humanos para una condición inflamatoria intestinal. Para la reparación de lesiones y tendones con la que suele asociarse, la evidencia hasta hoy es preclínica: más de 100 estudios animales más un pequeño reporte observacional.',
      det: 'Distinción importante: BPC-157 sí tiene datos reales de ensayos en humanos. Un ensayo de Fase 2 para colitis ulcerosa (Croacia) encontró una mejora dependiente de dosis estadísticamente significativa en puntuaciones endoscópicas y clínicas, y los ensayos croatas de comienzos de los 2000 lo encontraron seguro y eficaz para enfermedad inflamatoria intestinal. El uso en reparación de lesiones, tendones y músculo, que representa la mayoría del uso real de este compuesto, se apoya en evidencia preclínica: más de 100 estudios animales más un estudio observacional pequeño y de baja calidad (7 de 12 personas con dolor crónico de rodilla reportaron alivio más de 6 meses después de una inyección). Los datos humanos de seguridad cubren los ensayos de la condición intestinal; el uso en recuperación de lesiones sigue siendo preclínico.',
      src: [
        { t: 'Human trial evidence review', u: 'https://www.telehealthally.com/guides/bpc-157-human-trial-evidence-guide' },
        { t: 'Evidence-gap analysis', u: 'https://wellfounded.health/insights/bpc-157-and-the-difference-between-an-evidence-gap-and-a-cover-up' },
      ],
    },
    {
      id: 'tb-500', area: 'healing-recovery', focus: ['general-support'], tier: 'community', name: 'TB-500',
      sum: 'Los datos de ensayos en humanos que suelen citarse para este compuesto provienen de la Timosina Beta-4 completa, una molécula relacionada pero más grande y aplicada de forma tópica. La evidencia de TB-500 en sí, el fragmento de 17 aminoácidos vendido como péptido, es preclínica.',
      det: 'Distinción crítica: al momento de esta investigación, la evidencia de TB-500 (el fragmento de 17 aminoácidos vendido como péptido) es preclínica en todas las indicaciones de reparación de tejido. Los datos de ensayos clínicos en humanos que sí existen (dos ensayos de Fase 2 en úlceras por estasis venosa y úlceras por presión, mostrando cicatrización acelerada en casi un mes, segura y bien tolerada) usaron Timosina Beta-4 completa, una molécula relacionada pero más grande, aplicada de forma tópica. La investigación preclínica (animal y celular) sobre Tβ4 respalda de forma amplia los mecanismos de cicatrización acelerada; si TB-500 en particular, como péptido inyectado, reproduce ese efecto sigue siendo una pregunta abierta.',
      src: [
        { t: 'TB-500 vs. Tβ4 evidence review', u: 'https://www.jeffreypengmd.com/post/tb-500-for-injury-recovery-what-the-research-actually-shows' },
        { t: 'Clinical profile', u: 'https://deltapeptides.com/tb-500' },
      ],
    },
    {
      id: 'kpv', area: 'healing-recovery', focus: ['general-support'], tier: 'community', name: 'KPV (fragmento de Alfa-MSH)',
      sum: 'Un mecanismo antiinflamatorio bien entendido, con una base de evidencia enteramente preclínica: modelos animales e investigación de laboratorio.',
      det: 'Un tripéptido derivado de la alfa-MSH con un mecanismo antiinflamatorio bien estudiado (bloquea la señalización de NF-kB, reduciendo la translocación nuclear hasta en 80% en modelos de laboratorio). Los efectos antiinflamatorios están documentados en modelos animales de colitis y peritonitis. La base de evidencia es preclínica: modelos animales e investigación de laboratorio.',
      src: [
        { t: 'Mechanism study, PubMed', u: 'https://pubmed.ncbi.nlm.nih.gov/12750433/' },
        { t: 'Alpha-MSH peptide review, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4130143/' },
      ],
    },

    // ---- Inmunidad ----
    {
      id: 'thymosin-alpha-1', area: 'immune-support', tier: 'clinical', name: 'Thymosin Alpha-1',
      sum: 'Ampliamente estudiado (más de 11,000 sujetos) con beneficio real y sólido en condiciones específicas como la hepatitis B, mientras que un ensayo grande en sepsis no encontró beneficio. La evidencia es específica por condición.',
      det: 'Estudiado en más de 11,000 sujetos humanos entre ensayos. Existen resultados reales y sólidos, específicos de ciertas condiciones: un ensayo aleatorizado pivotal en hepatitis B crónica encontró 40.6% de respuesta virológica completa con un curso de 26 semanas frente a 9.4% en controles; un ensayo de 12 meses en pacientes con tuberculosis pulmonar y diabetes encontró tasas significativamente mejores de conversión de esputo y resolución de lesiones, junto con recuentos aumentados de CD3+, CD4+ y células NK. Los resultados varían según la condición: un ensayo grande de Fase 3 en sepsis (22 centros, China) no encontró beneficio significativo en ningún desenlace. A nivel mecanístico eleva los niveles de linfocitos T CD4+ y la relación CD4/CD8, razón por la cual se estudia en poblaciones inmunocomprometidas (VIH, inmunosupresión asociada a cáncer, declive inmune por edad). Esas poblaciones de ensayo son específicas; un adulto sano es un contexto distinto.',
      src: [
        { t: 'Clinical evidence review', u: 'https://www.peptidejournal.org/research/thymosin-alpha-1-clinical-evidence-review' },
        { t: 'TB/diabetes trial, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8713191/' },
        { t: 'Sepsis trial (TESTS)', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12208829/' },
      ],
    },
    {
      id: 'll-37', area: 'immune-support', tier: 'clinical', name: 'LL-37 (Catelicidina)',
      sum: 'Existen datos reales de ensayos, casi enteramente en cicatrización tópica de heridas. Los mecanismos antimicrobianos e inmunes están bien estudiados en laboratorio, con los ensayos en humanos para esas aplicaciones más amplias aún en etapa temprana.',
      det: 'Los datos humanos más avanzados están en cicatrización tópica de heridas: un ensayo aleatorizado de Fase IIb (148 pacientes) encontró 28.1% de cierre completo de herida con LL-37 frente a 8.1% con placebo en el subgrupo de heridas grandes; un ensayo aleatorizado más pequeño en úlceras venosas de pierna también mostró mejor cicatrización. Un ensayo de Fase I lo evaluó por inyección intratumoral en melanoma, encontrando tolerabilidad aceptable y respuesta biológica variable. Los mecanismos inmunes y antimicrobianos más amplios (disrupción de membranas microbianas, modulación de la señalización inflamatoria) están bien documentados en investigación de laboratorio, mientras que "la traslación clínica sigue en su infancia" para esas aplicaciones más amplias.',
      src: [
        { t: 'Antimicrobial mechanism review', u: 'https://www.sciencedirect.com/science/article/pii/S156713482500142X' },
        { t: 'Phase IIb wound trial', u: 'https://link.springer.com/article/10.1007/s10989-025-10778-z' },
      ],
    },
    {
      id: 'tymalin', area: 'immune-support', tier: 'clinical', name: 'Tymalin',
      sum: 'Décadas de uso clínico real y datos llamativos de mortalidad a largo plazo en la investigación de Europa del Este. Esa evidencia proviene de la práctica clínica allí y está por replicarse de forma independiente bajo estándares de ensayo occidentales.',
      det: 'Desarrollado en los años 70 (el mismo laboratorio Khavinson/Morozov detrás de Epithalon) y en uso clínico por más de 40 años en Rusia y Europa del Este, con aprobación regulatoria en esos países. Un estudio notable de 2021 encontró que mejoró marcadores de estado inmune y desenlaces clínicos en pacientes mayores con COVID-19. Por separado, se le describe como "el ensayo clínico en humanos más largo jamás realizado sobre un péptido terapéutico": un seguimiento a 6 años en pacientes mayores reportó una reducción de 45% en mortalidad cardiovascular y de 28% en mortalidad por todas las causas. También se usa como terapia adyuvante para influenza, hepatitis B y C, herpes simple y VIH en los países donde se emplea clínicamente. La replicación independiente bajo revisión regulatoria de EE.UU. y la UE está por realizarse.',
      src: [
        { t: 'COVID-19 immune study', u: 'https://link.springer.com/article/10.1134/S2079057021040068' },
        { t: 'Immunocorrection review', u: 'https://link.springer.com/article/10.1134/S2079086421040046' },
      ],
    },
    {
      id: 'pnc-27', area: 'immune-support', tier: 'community', name: 'PNC-27',
      sum: 'Un compuesto experimental de investigación anticancerígena estudiado en cultivos celulares. Su base de evidencia es preclínica, y su contexto de investigación es la oncología más que el soporte inmune.',
      det: 'Nota de encuadre: PNC-27 es un compuesto experimental derivado de p53, estudiado por destruir selectivamente membranas de células cancerosas in vitro. Su contexto de investigación es la oncología más que el soporte inmune que esta área sugiere. La investigación hasta hoy es a nivel de cultivo celular (más de 20 líneas celulares de cáncer humano evaluadas) con datos in vivo (animales) limitados; los ensayos clínicos en humanos están por realizarse. No cuenta con aprobación para uso humano de ninguna autoridad regulatoria.',
      src: [
        { t: 'Mechanism review, PMC', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9138867/' },
        { t: 'PNAS mechanism study', u: 'https://www.pnas.org/doi/10.1073/pnas.0909364107' },
      ],
    },

    // ---- Piel y cabello ----
    {
      id: 'ghk-cu', area: 'skin-hair-aesthetics', focus: ['skin', 'hair'], tier: 'clinical', name: 'GHK-Cu',
      sum: 'Evidencia sólida y repetida de ensayos clínicos en piel y cicatrización (ver Reparación y recuperación); ensayos humanos más pequeños también muestran mejoras reales en conteo capilar y densidad folicular con uso tópico, apoyadas en ensayos más pequeños que los de piel.',
      det: 'Para piel: ver la entrada completa de GHK-Cu en Reparación y recuperación. Los ensayos de reducción de cicatriz, cierre de herida y aumento de colágeno de allí aplican directamente al uso en piel y estética, extendiéndose más allá de la reparación de heridas hacia la estimulación de colágeno y la calidad visible de la piel. Para cabello en particular la evidencia es real y más delgada: un ensayo aleatorizado de 2016 con una formulación de péptido GHK encontró aumentos significativos de conteo capilar tras 6 meses de uso tópico frente a placebo en hombres con alopecia de patrón, y un estudio de 2015 que combinó GHK-Cu con otros péptidos activos para cabello superó al placebo en densidad y diámetro folicular. El mecanismo (regulación al alza de VEGF, supresión de TGF-β1, activación de Wnt/β-catenina en células de la papila dérmica) está bien caracterizado en investigación de laboratorio. Resumen honesto: un mecanismo bien entendido, datos animales positivos y un conjunto de estudios humanos positivos más pequeños. Los ensayos aleatorizados a gran escala están por realizarse.',
      src: [
        { t: 'Hair growth evidence review', u: 'https://www.gethealthspan.com/research/article/ghk-cu-hair-growth-evidence-review' },
        { t: 'In vitro hair growth study', u: 'https://www.researchgate.net/publication/6135527_The_effect_of_tripeptide-copper_complex_on_human_hair_growth_in_vitro' },
      ],
    },
    {
      id: 'glow-blend', area: 'skin-hair-aesthetics', focus: ['skin', 'hair'], tier: 'community', name: 'GLOW (GHK-Cu + TB-500 + BPC-157)',
      sum: 'Una mezcla construida a partir de compuestos investigados individualmente. Existe evidencia para cada ingrediente por separado; la combinación como conjunto está por evaluarse en ensayos.',
      det: 'Un producto combinado (GHK-Cu + TB-500 + BPC-157) construido a partir de compuestos investigados individualmente; ver la entrada propia de cada uno (GHK-Cu aquí y en Reparación y recuperación; BPC-157 y TB-500 en Reparación y recuperación). Esta combinación específica está por evaluarse en ensayos como conjunto, la misma advertencia que aplica a la mezcla CJC-1295+Ipamorelin en Rendimiento físico. La confianza en los ingredientes individuales aplica a esos ingredientes: combinar compuestos puede cambiar la absorción, los efectos de interacción y los desenlaces de formas que los ensayos de ingrediente único dejan abiertas.',
      src: [],
    },
    {
      id: 'klow-blend', area: 'skin-hair-aesthetics', focus: ['skin', 'hair'], tier: 'community', name: 'KLOW (GHK-Cu + BPC-157 + TB-500 + KPV)',
      sum: 'Una mezcla construida a partir de compuestos investigados individualmente. Existe evidencia para cada ingrediente por separado; la combinación como conjunto está por evaluarse en ensayos.',
      det: 'Un producto combinado (GHK-Cu + BPC-157 + TB-500 + KPV) construido a partir de compuestos investigados individualmente; ver la entrada propia de cada uno (GHK-Cu aquí y en Reparación y recuperación; BPC-157, TB-500 y KPV en Reparación y recuperación). Esta combinación específica está por evaluarse en ensayos como conjunto, la misma advertencia que aplica a la mezcla CJC-1295+Ipamorelin en Rendimiento físico. La confianza en los ingredientes individuales aplica a esos ingredientes: combinar compuestos puede cambiar la absorción, los efectos de interacción y los desenlaces de formas que los ensayos de ingrediente único dejan abiertas.',
      src: [],
    },

    // ---- Sueño y estrés ----
    {
      id: 'dsip', area: 'sleep-stress', tier: 'clinical', name: 'DSIP',
      sum: 'Existen ensayos reales en humanos y difieren entre sí: algunos muestran una mejora significativa del sueño, uno encontró el efecto mínimo frente a placebo. La evidencia es genuinamente mixta.',
      det: 'Existen ensayos reales en humanos, y los resultados son inconsistentes entre ellos. Un ensayo temprano: 7 pacientes con insomnio severo que recibieron 10 inyecciones de DSIP normalizaron el sueño durante 3 a 7 meses en todos los casos salvo uno, con mejor ánimo y desempeño diurno. Un ensayo aparte en 6 insomnes crónicos encontró mayor duración del sueño, mayor calidad, menos interrupciones y algo más de sueño REM sin sedación diurna, aunque el efecto promotor del sueño apareció en la segunda hora tras la inyección (en la primera hora se observó un leve efecto activador). Otro ensayo controlado encontró que el tiempo total de sueño aumentó mientras los despertares nocturnos siguieron al placebo, concluyendo que la significancia clínica era mínima. Valoración general de los revisores: "la investigación clínica sigue siendo limitada y algo controvertida".',
      src: [
        { t: 'Early insomnia trial, PubMed', u: 'https://pubmed.ncbi.nlm.nih.gov/3583493/' },
        { t: 'Disturbed sleep trial, PubMed', u: 'https://pubmed.ncbi.nlm.nih.gov/7028502/' },
      ],
    },
    {
      id: 'neuro-calm-pm', area: 'sleep-stress', tier: 'community', name: 'NEURO-CALM PM (mezcla)',
      sum: 'Un producto en mezcla cuya combinación está por evaluarse en ensayos como conjunto. La evidencia proviene de sus ingredientes individuales, investigados por separado.',
      det: 'Una mezcla combinada; los componentes individuales deben investigarse por sus propios méritos (esta entrada de catálogo no especifica una composición que corresponda de forma limpia a los compuestos únicos ya investigados en este documento). Como con otras mezclas (GLOW/KLOW, CJC-1295+Ipamorelin), esta combinación específica está por evaluarse en ensayos; considera la mezcla en sí como nivel comunidad, independientemente de la evidencia propia de cualquier ingrediente individual.',
      src: [],
    },

    // ---- Bienestar sexual ----
    {
      id: 'pt-141', area: 'sexual-wellness', tier: 'clinical', name: 'PT-141 (Bremelanotida)',
      sum: 'Genuinamente aprobado por la FDA con datos sólidos de ensayos (más de 1,200 mujeres). La aprobación es específicamente para un trastorno del deseo diagnosticado en mujeres premenopáusicas, y allí mejoró las puntuaciones de deseo mientras el conteo de encuentros sexuales satisfactorios, un desenlace clave del ensayo, se mantuvo cerca del placebo.',
      det: 'Aprobado por la FDA (como Vyleesi®, junio de 2019) para el trastorno del deseo sexual hipoactivo (TDSH) adquirido y generalizado en mujeres premenopáusicas: el segundo fármaco aprobado en la historia para el trastorno del deseo sexual femenino, y el primero con un mecanismo no hormonal (actúa centralmente vía receptores MC4R y vías dopaminérgicas, donde Viagra y Cialis actúan sobre el flujo sanguíneo). Los ensayos incluyeron más de 1,200 mujeres. Advertencia importante y específica: mejoró las puntuaciones de deseo y de malestar asociado al deseo frente a placebo, mientras el número de "encuentros sexuales satisfactorios", un desenlace clave del ensayo, se mantuvo cerca del placebo. La náusea fue el efecto secundario más común (40% del grupo de tratamiento en los ensayos RECONNECT, resolviéndose en ~3 horas). Se usa fuera de indicación en hombres para disfunción eréctil y libido baja; la aprobación de la FDA y la población de ensayo descrita corresponden específicamente a mujeres premenopáusicas con TDSH.',
      src: [
        { t: 'FDA approval coverage', u: 'https://www.theloopway.com/research/pt-141-female-sexual-desire-2019' },
        { t: 'Clinical overview', u: 'https://www.peptides.org/pt-141/' },
      ],
    },
  ],
};

/* ---------------------------------------------------------------------------
   Bridge from research names to catalogue names.

   The two datasets name compounds differently: the research entries use the
   form used in the literature ("PT-141 (Bremelanotide)"), the catalogue uses
   the form on the label ("PT-141"). Mapped explicitly rather than fuzzy-matched
   — a near-miss here would send a reader to the wrong compound, which is worse
   than showing no link at all.

   A research entry with no alias and no exact name match simply gets no link:
   10 of the 32 compounds researched are not sold, and that is fine. Do not
   invent a mapping to make the link appear.
   --------------------------------------------------------------------------- */
const EXPLORE_CATALOG_ALIAS = {
  '5-Amino-1MQ': '5-Amino-1mq',
  'SS-31 (Elamipretide)': 'SS-31',
  'CJC-1295 (No DAC) + Ipamorelin': 'CJC-1295 noDAC',
  'IGF-1 LR3': 'IGF1-LR3',
  'Thymosin Alpha-1': 'Thymosin A',
  'PT-141 (Bremelanotide)': 'PT-141',
  'KPV (Alpha-MSH Fragment)': 'KPV',
  'KLOW (GHK-Cu + BPC-157 + TB-500 + KPV)': 'KLOWUP',
};
