// Changes for defaulting tax amount fields to 0 on create and update.

// ledger.service.js
class LedgerService {
  // Default tax amount fields to 0 on create.
  applyTaxDefaults(data) {
    const payload = { ...data };
    const keys = [
      'continu_tax_duty',
      'continu_tax_vat',
      'additional_tax_duty',
      'additional_tax_vat'
    ];
    keys.forEach((key) => {
      if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
        payload[key] = 0;
      }
    });
    return payload;
  }

  normalizeTaxAmountOnUpdate(value, fallback) {
    if (value === undefined) return fallback;
    if (value === null || value === '') return 0;
    return value;
  }

  async createLedger(data, confirmDuplicate) {
    const payload = this.applyTaxDefaults(data);
    await ledgerDao.insertLedger(payload);
  }

  async importLedgers(rows, options = {}) {
    for (const row of rows) {
      const payload = this.applyTaxDefaults(row);
      await ledgerDao.insertLedger(payload);
    }
  }

  async createTaxDeskEntry(data) {
    const payload = this.applyTaxDefaults({
      ...data,
      tax_status: '未处置',
      tax_desk_only: 1
    });
    await ledgerDao.insertLedger(payload);
  }

  async updateLedger(id, data) {
    const existing = await ledgerDao.findById(id);
    const normalized = {
      ...data,
      continu_tax_duty: this.normalizeTaxAmountOnUpdate(
        data.continu_tax_duty,
        existing?.continu_tax_duty
      ),
      continu_tax_vat: this.normalizeTaxAmountOnUpdate(
        data.continu_tax_vat,
        existing?.continu_tax_vat
      ),
      additional_tax_duty: this.normalizeTaxAmountOnUpdate(
        data.additional_tax_duty,
        existing?.additional_tax_duty
      ),
      additional_tax_vat: this.normalizeTaxAmountOnUpdate(
        data.additional_tax_vat,
        existing?.additional_tax_vat
      )
    };
    await ledgerDao.updateLedger(id, normalized);
  }

  async pluginUpdateByDeclNo(declNo, data) {
    const payload = {};
    const taxKeys = new Set([
      'continu_tax_duty',
      'continu_tax_vat',
      'additional_tax_duty',
      'additional_tax_vat'
    ]);
    Object.keys(data || {}).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        if (taxKeys.has(key)) {
          payload[key] = this.normalizeTaxAmountOnUpdate(data[key], undefined);
        } else {
          payload[key] = data[key];
        }
      }
    });
    await ledgerDao.updateByDeclNo(declNo, payload);
  }
}

// ledger.dao.js
class LedgerDao {
  async insertLedger(data) {
    const params = [
      data.continu_tax_duty ?? null,
      data.continu_tax_vat ?? null,
      data.additional_tax_duty ?? null,
      data.additional_tax_vat ?? null
    ];
  }

  async updateLedger(id, data) {
    const params = [
      data.continu_tax_duty ?? null,
      data.continu_tax_vat ?? null,
      data.additional_tax_duty ?? null,
      data.additional_tax_vat ?? null
    ];
  }
}
