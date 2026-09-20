/**
 * Script utilitaire generate test releve. Automatise une opération de maintenance ou de préparation du projet.
 */
import pg from 'pg';
import ExcelJS from 'exceljs';
import path from 'path';
import dotenv from 'dotenv';

// Charger les variables d'environnement depuis le fichier .env à la racine du backend
dotenv.config();

const { Pool } = pg;

// Créer le pool de connexion avec les variables d'environnement ou des valeurs par défaut
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD, // ATTENTION : cette variable doit être définie dans .env
  database: process.env.DB_NAME || 'loyola_finance',
});

// Fonction pour générer une date aléatoire dans les 60 derniers jours
function randomDate() {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 60);
  const date = new Date(now);
  date.setDate(now.getDate() - daysAgo);
  return date;
}

// Fonction pour générer un montant aléatoire entre 50 et 1000 USD
function randomAmount() {
  return Math.round((Math.random() * (1000 - 50) + 50) * 100) / 100;
}

// Fonction pour générer une référence unique
function generateReference(index) {
  return `TRX-2025-${String(index + 1).padStart(6, '0')}`;
}

// Application des 6 types d’erreur
function applyErrorType(originalText, errorType) {
  if (errorType === 'perfect') return originalText;

  const parts = originalText.split(' ');
  const matricule = parts[0];
  const nomComplet = parts.slice(1, -2).join(' ');
  const faculte = parts[parts.length - 2];
  const niveau = parts[parts.length - 1];

  if (errorType === 'typo') {
    // fautes d'orthographe : modifier 1 ou 2 lettres dans le nom
    let nom = nomComplet;
    const pos = Math.floor(Math.random() * nom.length);
    const char = nom[pos];
    const alter = String.fromCharCode(char.charCodeAt(0) + 1);
    nom = nom.substring(0, pos) + alter + nom.substring(pos + 1);
    if (Math.random() > 0.5) {
      const pos2 = (pos + 3) % nom.length;
      nom = nom.substring(0, pos2) + 'x' + nom.substring(pos2 + 1);
    }
    return `${matricule} ${nom} ${faculte} ${niveau}`;
  }

  if (errorType === 'missing_matricule') {
    return `${nomComplet} ${faculte} ${niveau}`;
  }

  if (errorType === 'inversion') {
    const nameWords = nomComplet.split(' ');
    const inverted = nameWords.reverse().join(' ');
    return `${matricule} ${inverted} ${faculte} ${niveau}`;
  }

  if (errorType === 'missing_name_part') {
    const nameWords = nomComplet.split(' ');
    if (nameWords.length > 2) {
      const removeIndex = Math.floor(Math.random() * nameWords.length);
      nameWords.splice(removeIndex, 1);
    }
    const truncated = nameWords.join(' ');
    return `${matricule} ${truncated} ${faculte} ${niveau}`;
  }

  if (errorType === 'missing_faculty_level') {
    let result = `${matricule} ${nomComplet}`;
    if (Math.random() > 0.5) result += ` ${faculte}`;
    if (Math.random() > 0.5) result += ` ${niveau}`;
    return result.trim();
  }

  return originalText;
}

async function generateTestReleve() {
  try {
    // Tester la connexion à PostgreSQL
    const client = await pool.connect();
    console.log('✓ Connexion PostgreSQL établie.');
    client.release();

    // Récupérer les 500 étudiants (promotions 2025-2026, faculté FAST)
    const query = `
      SELECT 
        e.matricule,
        e.nom_complet,
        p.libelle AS promotion_libelle,
        n.code AS niveau_code,
        f.code AS faculte_code,
        fi.code AS filiere_code
      FROM etudiants e
      JOIN promotions p ON e.promotion_id = p.id
      JOIN facultes f ON p.faculte_id = f.id
      JOIN niveaux n ON p.niveau_id = n.id
      JOIN filieres fi ON p.filiere_id = fi.id
      WHERE p.annee_debut = 2025 AND p.annee_fin = 2026
        AND f.code = 'FAST'
    `;
    const res = await pool.query(query);
    const students = res.rows;

    if (students.length === 0) {
      console.error('❌ Aucun étudiant trouvé pour l\'année 2025-2026. Vérifiez la base.');
      process.exit(1);
    }
    console.log(`✓ ${students.length} étudiants récupérés.`);

    const categories = [
      { type: 'perfect', label: 'Parfait', count: 200 },
      { type: 'typo', label: 'Fautes orthographe', count: 200 },
      { type: 'missing_matricule', label: 'Absence matricule', count: 200 },
      { type: 'inversion', label: 'Inversion noms', count: 200 },
      { type: 'missing_name_part', label: 'Absence nom partiel', count: 200 },
      { type: 'missing_faculty_level', label: 'Absence fac/niveau', count: 200 },
    ];

    const transactions = [];
    let globalIndex = 0;

    for (const cat of categories) {
      for (let i = 0; i < cat.count; i++) {
        const student = students[Math.floor(Math.random() * students.length)];
        const matricule = student.matricule;
        const nom = student.nom_complet.toUpperCase();
        const faculte = student.faculte_code;
        const niveau = student.niveau_code;
        const baseDescription = `${matricule} ${nom} ${faculte} ${niveau}`;
        const description = applyErrorType(baseDescription, cat.type);
        const reference = generateReference(globalIndex);
        const date = randomDate();
        const amount = randomAmount();
        transactions.push({
          'reference number': reference,
          description: description,
          'transaction date': date,
          debit: amount,
        });
        globalIndex++;
      }
      console.log(`✓ Généré ${cat.count} transactions (${cat.label})`);
    }

    // Création du fichier Excel avec ExcelJS (format .xlsx uniquement).
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Releve');
    worksheet.columns = [
      { header: 'reference number', key: 'reference number', width: 22 },
      { header: 'description', key: 'description', width: 70 },
      { header: 'transaction date', key: 'transaction date', width: 18 },
      { header: 'debit', key: 'debit', width: 14 }
    ];
    transactions.forEach((transaction) => worksheet.addRow(transaction));
    worksheet.getRow(1).font = { bold: true };
    worksheet.getColumn('transaction date').numFmt = 'yyyy-mm-dd';
    worksheet.getColumn('debit').numFmt = '#,##0.00';

    const outputPath = path.resolve(process.cwd(), 'releve_test_1200.xlsx');
    await workbook.xlsx.writeFile(outputPath);
    console.log(`\n✅ Fichier généré : ${outputPath}`);
    console.log(`   Total transactions : ${transactions.length}`);
    console.log(`   Répartition : 200 par catégorie`);

    await pool.end();
  } catch (err) {
    console.error('Erreur lors de la génération :', err.message);
    if (err.message.includes('password')) {
      console.error('   → Le mot de passe PostgreSQL est manquant ou incorrect.');
      console.error('   → Vérifiez la variable DB_PASSWORD dans votre fichier .env (backend/.env)');
    }
    await pool.end();
    process.exit(1);
  }
}

generateTestReleve();