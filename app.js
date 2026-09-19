const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5775;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Buat pool koneksi database
const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USERNAME || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE,
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Function untuk mengambil daftar backup
const bacaBackup = async () => {
    const sql = `SELECT * FROM backup ORDER BY waktu DESC`;
    const [rows] = await pool.execute(sql);
    return rows.length > 0 ? rows : false;
};

// Function untuk mengambil detail backup berdasarkan id_backup
const bacaDetailBackup = async (id_backup) => {
    const sql = `SELECT * FROM backup_transaksi WHERE id_backup = ? ORDER BY tgl_jam`;
    const [rows] = await pool.execute(sql, [id_backup]);
    return rows.length > 0 ? rows : false;
};

// Wrapper db untuk memudahkan pemanggilan
const db = {
    bacaBackup,
    bacaDetailBackup
};

// Endpoint cek status
app.get("/status", (req, res) => {
    res.json({ kode: "01", status: "API Berbasis ExpressJS OK" });
});

app.get("/api/status", (req, res) => {
    res.json({ kode: "01", status: "API Berbasis ExpressJS OK" });
});

// Endpoint daftar backup
app.get("/daftar_backup", async (req, res) => {
    try {
        const dtbackup = await db.bacaBackup();
        if (!dtbackup) return res.json({ kode: "00", pesan: "Data Backup Tidak Di Temukan" });
        res.json({ kode: "01", pesan: "Data Backup Di Temukan", data: dtbackup });
    } catch (error) {
        res.status(500).json({ kode: "99", pesan: "Gagal mengambil daftar backup", error_code: error.code, message: error.message });
    }
});

// Endpoint detail backup
app.post("/detail_backup", async (req, res) => {
    try {
        const idbackup = req.body.idbackup;
        if (!idbackup) return res.status(422).json({ kode: "00", pesan: "idbackup wajib dikirim" });

        const dtdetail = await db.bacaDetailBackup(idbackup);
        if (!dtdetail) return res.json({ kode: "00", pesan: "Data Detail Backup Tidak Di Temukan", data: [] });

        res.json({ kode: "01", pesan: "Data Detail Backup Di Temukan", data: dtdetail });
    } catch (error) {
        res.status(500).json({ kode: "99", pesan: "Gagal mengambil detail backup", error_code: error.code, message: error.message });
    }
});

// Endpoint cek database
app.get("/api/cekdb", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT DATABASE() AS database_aktif");
        const [tables] = await pool.query("SHOW TABLES");
        res.json({ kode: "01", status: "Koneksi database berhasil", database: rows[0].database_aktif, tables: tables });
    } catch (error) {
        res.status(500).json({ kode: "99", status: "Koneksi database gagal", error_code: error.code, message: error.message });
    }
});

// Endpoint backup
app.post("/api/backup", async (req, res) => {
    let connection;
    try {
        const nama = req.body.nama_backup;
        const dtxInput = req.body.dtx;
        if (!nama || !dtxInput) return res.status(422).json({ kode: "00", status: "Nama backup atau data transaksi tidak tersedia" });

        const dtx = Buffer.from(dtxInput, "base64").toString("utf8");
        if (!dtx || dtx.trim() === "") return res.status(422).json({ kode: "00", status: "Format data backup tidak valid" });

        const idBackup = Date.now().toString();
        const arrData = dtx.split("#");

        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.execute("INSERT INTO backup (id, nama, channel, waktu) VALUES (?, ?, ?, NOW())", [idBackup, nama, "nodejs"]);

        let berhasil = 0, gagal = 0;
        for (const item of arrData) {
            if (!item.trim()) continue;
            const arrData2 = item.split("|");
            if (arrData2.length < 5) { gagal++; continue; }

            const [idx, deskripsi, waktu, nominal, jenis] = arrData2;
            const idTransaksiBackup = `${idBackup}-${idx}`;

            await connection.execute(
                "INSERT INTO backup_transaksi (id, id_backup, tgl_jam, nominal, jenis, uraian) VALUES (?, ?, ?, ?, ?, ?)",
                [idTransaksiBackup, idBackup, waktu, nominal, jenis, deskripsi]
            );
            berhasil++;
        }

        await connection.commit();
        res.status(200).json({ kode: "01", status: "Proses Backup Berhasil dengan Rincian", berhasil, gagal });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(error);
        res.status(500).json({ kode: "99", status: "Server Error", error_code: error.code, message: error.message });
    } finally {
        if (connection) connection?.release();
    }
});

// Jalankan server
app.listen(port, () => {
    console.log(`API Berjalan di Port: ${port}`);
});