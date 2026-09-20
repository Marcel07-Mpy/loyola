/**
 * Contrôleur Audit : consultation filtrée, options de filtres et export PDF.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AuditModel, { AUDIT_ACTIONS } from '../models/AuditModel.js';
import { buildAuditReportPdf } from '../services/auditReportPdfService.js';

const ACTION_LABELS = {
  validation_manuelle: 'Validation manuelle de paiement',
  remboursement: "Remboursement d'excédent",
  annulation_paiement: 'Annulation administrative',
  suppression_paiement: 'Suppression administrative',
  reaffectation_paiement: 'Reaffectation administrative'
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoPath = path.resolve(__dirname, '../assets/logo.png');

const parseDate = (value) => {
  if (!value) return '';
  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) return null;
  return normalized;
};

const parseAuditFilters = (query = {}) => {
  const search = typeof query.q === 'string' ? query.q.trim().slice(0, 180) : '';
  const agentIdRaw = query.agent_id ?? query.agentId;
  const agentId = agentIdRaw ? Number.parseInt(agentIdRaw, 10) : null;
  const action = typeof query.action === 'string' ? query.action.trim() : '';
  const dateFrom = parseDate(query.date_from ?? query.dateFrom);
  const dateTo = parseDate(query.date_to ?? query.dateTo);

  if (agentIdRaw && (!Number.isInteger(agentId) || agentId <= 0)) {
    const error = new Error('Utilisateur de filtre invalide.');
    error.status = 400;
    throw error;
  }
  if (action && !AUDIT_ACTIONS.includes(action)) {
    const error = new Error("Type d'action de filtre invalide.");
    error.status = 400;
    throw error;
  }
  if (dateFrom === null || dateTo === null) {
    const error = new Error('La date de debut ou de fin est invalide.');
    error.status = 400;
    throw error;
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    const error = new Error('La date de debut doit etre anterieure ou egale a la date de fin.');
    error.status = 400;
    throw error;
  }

  return { search, agentId, action, dateFrom, dateTo };
};

const formatFilterDate = (value) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

const getFilterLabels = async (filters) => {
  const users = await AuditModel.getFilterUsers();
  const selectedUser = filters.agentId
    ? users.find((user) => Number(user.id) === Number(filters.agentId))
    : null;

  let periodLabel = 'Toutes les dates';
  if (filters.dateFrom && filters.dateTo) {
    periodLabel = `${formatFilterDate(filters.dateFrom)} au ${formatFilterDate(filters.dateTo)}`;
  } else if (filters.dateFrom) {
    periodLabel = `A partir du ${formatFilterDate(filters.dateFrom)}`;
  } else if (filters.dateTo) {
    periodLabel = `Jusqu'au ${formatFilterDate(filters.dateTo)}`;
  }

  return {
    periodLabel,
    userLabel: selectedUser
      ? `${selectedUser.username} (${selectedUser.role})`
      : filters.agentId ? `Utilisateur #${filters.agentId}` : 'Tous les utilisateurs',
    userName: selectedUser?.username || '',
    userRole: selectedUser?.role || '',
    actionLabel: filters.action ? (ACTION_LABELS[filters.action] || filters.action) : 'Toutes les actions',
    searchLabel: filters.search || ''
  };
};

const sanitizeFileNamePart = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/_/g, ' ')
  .replace(/[^a-zA-Z0-9 -]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase('fr-FR');

export const getAudits = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const filters = parseAuditFilters(req.query);
    const data = await AuditModel.findAll(page, limit, filters);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Erreur récupération des audits' });
  }
};

export const getAuditFilterOptions = async (_req, res) => {
  try {
    const users = await AuditModel.getFilterUsers();
    res.json({
      users,
      actions: AUDIT_ACTIONS.map((value) => ({ value, label: ACTION_LABELS[value] || value }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Impossible de charger les filtres d’audit." });
  }
};

export const exportAuditReport = async (req, res) => {
  try {
    const filters = parseAuditFilters(req.query);
    const audits = await AuditModel.findForExport(filters);

    if (audits.length === 0) {
      return res.status(404).json({ message: "Aucune donnée d’audit ne correspond aux filtres sélectionnés." });
    }

    const generatedAt = new Date();
    const labels = await getFilterLabels(filters);
    const userDescriptor = labels.userName
      ? `${labels.userName} ${labels.userRole}`
      : 'tous utilisateurs';
    const safeUserDescriptor = sanitizeFileNamePart(userDescriptor) || 'utilisateur';
    const fileName = `rapport audit ${safeUserDescriptor}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');

    const doc = buildAuditReportPdf({ audits, filters: labels, logoPath, generatedAt });
    doc.on('error', (error) => {
      console.error('Erreur PDF audit :', error);
      if (!res.headersSent) res.status(500).json({ message: "L’export du rapport d’audit a échoué." });
      else res.destroy(error);
    });
    doc.pipe(res);
    doc.end();
    return undefined;
  } catch (err) {
    console.error(err);
    if (res.headersSent) return res.destroy(err);
    return res.status(err.status || 500).json({
      message: err.status ? err.message : "L’export du rapport d’audit n’a pas pu être généré."
    });
  }
};
