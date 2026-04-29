export interface WordEntry {
  /** Normalized: uppercase, no accents — used for game comparison.
   *  May contain a single space for two-word terms; those entries
   *  award 2 extra attempts (8 total instead of 6). */
  word: string;
  /** With accents — shown in result messages */
  display: string;
}

export const WORDS: WordEntry[] = [
  // 5 letters
  { word: 'SOLDE',       display: 'SOLDE'       },
  { word: 'SEUIL',       display: 'SEUIL'       },
  { word: 'CONGE',       display: 'CONGÉ'       },
  { word: 'ETAPE',       display: 'ÉTAPE'       },
  { word: 'CYCLE',       display: 'CYCLE'       },
  { word: 'MOTIF',       display: 'MOTIF'       },
  { word: 'CADRE',       display: 'CADRE'       },
  { word: 'REGLE',       display: 'RÈGLE'       },
  { word: 'ARRET',       display: 'ARRÊT'       },
  { word: 'BILAN',       display: 'BILAN'       },
  { word: 'DEBIT',       display: 'DÉBIT'       },
  { word: 'DEPOT',       display: 'DÉPÔT'       },
  { word: 'DEBUT',       display: 'DÉBUT'       },
  { word: 'AUDIT',       display: 'AUDIT'       },
  { word: 'QUOTA',       display: 'QUOTA'       },
  { word: 'PAYER',       display: 'PAYER'       },

  // 6 letters
  { word: 'DROITS',      display: 'DROITS'      },
  { word: 'COMPTE',      display: 'COMPTE'      },
  { word: 'PROFIL',      display: 'PROFIL'      },
  { word: 'STATUT',      display: 'STATUT'      },
  { word: 'EXPORT',      display: 'EXPORT'      },
  { word: 'IMPORT',      display: 'IMPORT'      },
  { word: 'MODELE',      display: 'MODÈLE'      },
  { word: 'REPORT',      display: 'REPORT'      },
  { word: 'CREDIT',      display: 'CRÉDIT'      },
  { word: 'CONGES',      display: 'CONGÉS'      },
  { word: 'FILTRE',      display: 'FILTRE'      },
  { word: 'EQUIPE',      display: 'ÉQUIPE'      },
  { word: 'ANNUEL',      display: 'ANNUEL'      },
  { word: 'VALIDE',      display: 'VALIDE'      },
  { word: 'ACCORD',      display: 'ACCORD'      },

  // 7 letters
  { word: 'PLAFOND',     display: 'PLAFOND'     },
  { word: 'ABSENCE',     display: 'ABSENCE'     },
  { word: 'DEMANDE',     display: 'DEMANDE'     },
  { word: 'CIRCUIT',     display: 'CIRCUIT'     },
  { word: 'PERIODE',     display: 'PÉRIODE'     },
  { word: 'CARENCE',     display: 'CARENCE'     },
  { word: 'FORFAIT',     display: 'FORFAIT'     },
  { word: 'EPARGNE',     display: 'ÉPARGNE'     },
  { word: 'ARRONDI',     display: 'ARRONDI'     },
  { word: 'SALAIRE',     display: 'SALAIRE'     },
  { word: 'CONTRAT',     display: 'CONTRAT'     },
  { word: 'EMPLOYE',     display: 'EMPLOYÉ'     },
  { word: 'PREAVIS',     display: 'PRÉAVIS'     },
  { word: 'RAPPORT',     display: 'RAPPORT'     },
  { word: 'SERVICE',     display: 'SERVICE'     },
  { word: 'DOSSIER',     display: 'DOSSIER'     },
  { word: 'JOURNEE',     display: 'JOURNÉE'     },
  { word: 'MALADIE',     display: 'MALADIE'     },
  { word: 'COMPTES',     display: 'COMPTES'     },
  { word: 'MISSION',     display: 'MISSION'     },
  { word: 'RELANCE',     display: 'RELANCE'     },
  { word: 'HORAIRE',     display: 'HORAIRE'     },
  { word: 'PRORATA',     display: 'PRORATA'     },
  { word: 'TRANCHE',     display: 'TRANCHE'     },

  // 8 letters
  { word: 'PLANNING',    display: 'PLANNING'    },
  { word: 'COMPTEUR',    display: 'COMPTEUR'    },
  { word: 'CREATION',    display: 'CRÉATION'    },
  { word: 'POINTAGE',    display: 'POINTAGE'    },
  { word: 'WORKFLOW',    display: 'WORKFLOW'    },
  { word: 'CAMPAGNE',    display: 'CAMPAGNE'    },
  { word: 'EFFECTIF',    display: 'EFFECTIF'    },

  // 9 letters
  { word: 'TRANSFERT',   display: 'TRANSFERT'   },
  { word: 'MENSUELLE',   display: 'MENSUELLE'   },
  { word: 'PREALABLE',   display: 'PRÉALABLE'   },
  { word: 'VERSEMENT',   display: 'VERSEMENT'   },
  { word: 'COLLECTIF',   display: 'COLLECTIF'   },
  { word: 'CATEGORIE',   display: 'CATÉGORIE'   },
  { word: 'REGLEMENT',   display: 'RÈGLEMENT'   },

  // 10 letters
  { word: 'AJUSTEMENT',  display: 'AJUSTEMENT'  },
  { word: 'CALENDRIER',  display: 'CALENDRIER'  },
  { word: 'ANNULATION',  display: 'ANNULATION'  },
  { word: 'ANCIENNETE',  display: 'ANCIENNETÉ'  },
  { word: 'DELEGATION',  display: 'DÉLÉGATION'  },
  { word: 'RATTRAPAGE',  display: 'RATTRAPAGE'  },
  { word: 'STATUTAIRE',  display: 'STATUTAIRE'  },
  { word: 'VALIDATION',  display: 'VALIDATION'  },
  { word: 'ENTREPRISE',  display: 'ENTREPRISE'  },
  { word: 'INDIVIDUEL',  display: 'INDIVIDUEL'  },
  { word: 'PREVENANCE',  display: 'PRÉVENANCE'  },

  // 11 letters
  { word: 'APPROBATION', display: 'APPROBATION' },
  { word: 'ACQUISITION', display: 'ACQUISITION' },
  { word: 'SUBROGATION', display: 'SUBROGATION' },
  { word: 'DEPARTEMENT', display: 'DÉPARTEMENT' },

  // 12 letters
  { word: 'JUSTIFICATIF', display: 'JUSTIFICATIF' },

  // 13 letters
  { word: 'COLLABORATEUR', display: 'COLLABORATEUR' },
  { word: 'ETABLISSEMENT', display: 'ÉTABLISSEMENT' },
  { word: 'REGLEMENTAIRE', display: 'RÉGLEMENTAIRE' },

  // 14 letters
  { word: 'FRACTIONNEMENT', display: 'FRACTIONNEMENT' },
  { word: 'REGULARISATION', display: 'RÉGULARISATION' },

  // ── Multi-word terms (spaces included → 2 extra attempts) ───────────────

  // 10 chars — 2 words
  { word: 'JOUR FERIE',   display: 'JOUR FÉRIÉ'   },
  { word: 'JOUR OUVRE',   display: 'JOUR OUVRÉ'   },
  { word: 'CONGE PAYE',   display: 'CONGÉ PAYÉ'   },
  { word: 'EXPORT PAIE',  display: 'EXPORT PAIE'  },

  // 12 chars — 2 words
  { word: 'JOURS CHOMES', display: 'JOURS CHÔMÉS' },
  { word: 'CONGE ANNUEL', display: 'CONGÉ ANNUEL' },

  // 13 chars — 2 words
  { word: 'DROITS ACQUIS', display: 'DROITS ACQUIS' },
  { word: 'FORFAIT JOURS', display: 'FORFAIT JOURS' },
  { word: 'EPARGNE TEMPS', display: 'ÉPARGNE TEMPS' },
  { word: 'CONGE MALADIE', display: 'CONGÉ MALADIE' },

  // 14 chars — 2 words
  { word: 'COMPTE EPARGNE', display: 'COMPTE ÉPARGNE' },

  // 13 chars — 3 words (d' or preposition becomes space)
  { word: 'MISE EN CONGE',   display: 'MISE EN CONGÉ'   },

  // 14 chars — 3 words
  { word: 'TAUX D ACTIVITE', display: "TAUX D'ACTIVITÉ"  },

  // 15 chars — 3 words
  { word: 'DELAI DE CARENCE', display: 'DÉLAI DE CARENCE' },
  { word: 'CYCLE DE TRAVAIL', display: 'CYCLE DE TRAVAIL' },
];
