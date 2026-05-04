const configurationLignes = {
    // Style par défaut pour les bus classiques
    default: {
        classe: "",
        couleur: "#cc0000",
        icone: "🚌"
    },
    // Règles spécifiques
    regles: [
        {
            test: (nom) => nom.includes("TB12"),
            classe: "is-tb12",
            couleur: "#8D6E63",
            icone: "🚌"
        },
        {
            test: (nom) => nom.includes("TB11"),
            classe: "is-tb11",
            couleur: "#fdc300",
            icone: "🚌"
        },
        {
            // Trams T1 à T10
            test: (nom) => /^T([1-9]|10)$/.test(nom),
            classe: "is-tram",
            couleur: "#00b0ff",
            icone: "🚃"
        }
    ]
};

// Fonction pour récupérer le style selon la ligne
function obtenirStyleLigne(nomLigne) {
    if (!nomLigne) return configurationLignes.default;
    const nom = nomLigne.toUpperCase();
    const regleMatch = configurationLignes.regles.find(r => r.test(nom));
    return regleMatch || configurationLignes.default;
}