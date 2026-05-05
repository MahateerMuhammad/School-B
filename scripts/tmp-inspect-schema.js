const pool = require('../src/config/db');

(async () => {
  try {
    const voucherCols = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fee_vouchers' ORDER BY ordinal_position"
    );

    console.log('fee_vouchers columns:');
    voucherCols.rows.forEach((row) => {
      console.log(`${row.column_name} | ${row.data_type}`);
    });

    const itemCols = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fee_voucher_items' ORDER BY ordinal_position"
    );

    console.log('');
    console.log('fee_voucher_items columns:');
    itemCols.rows.forEach((row) => {
      console.log(`${row.column_name} | ${row.data_type}`);
    });
  } catch (error) {
    console.error('Schema inspection failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
