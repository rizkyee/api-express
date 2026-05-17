const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5775;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

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

app.get("/status", (req, res) => {
    res.json({
        kode: "01",
        status: "API Berbasis ExpressJS OK"
    });
});

app.get("/api/status", (req, res) => {
    res.json({
        kode: "01",
        status: "API Berbasis ExpressJS OK"
    });
});

app.get("/api/cekdb", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT DATABASE() AS database_aktif");

        const [tables] = await pool.query("SHOW TABLES");

        res.json({
            kode: "01",
            status: "Koneksi database berhasil",
            database: rows[0].database_aktif,
            tables: tables
        });

    } catch (error) {
        res.status(500).json({
            kode: "99",
            status: "Koneksi database gagal",
            error_code: error.code,
            message: error.message
        });
    }
});

app.post("/api/backup", async (req, res) => {
    let connection;

    try {
        const nama = req.body.nama_backup;
        const dtxInput = req.body.dtx;

        console.log("Request backup diterima");
        console.log("Nama backup:", nama);
        console.log("Ada data dtx:", dtxInput ? "Ya" : "Tidak");

        if (!nama || !dtxInput) {
            return res.status(422).json({
                kode: "00",
                status: "Nama backup atau data transaksi tidak tersedia"
            });
        }

        const dtx = Buffer.from(dtxInput, "base64").toString("utf8");

        if (!dtx || dtx.trim() === "") {
            return res.status(422).json({
                kode: "00",
                status: "Format data backup tidak valid"
            });
        }

        console.log("Data hasil decode:", dtx);

        const idBackup = Date.now().toString();
        const arrData = dtx.split("#");

        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.execute(
            "INSERT INTO backup (id, nama, channel, waktu) VALUES (?, ?, ?, NOW())",
            [idBackup, nama, "nodejs"]
        );

        let berhasil = 0;
        let gagal = 0;

        for (const item of arrData) {
            if (!item || item.trim() === "") {
                continue;
            }

            const arrData2 = item.split("|");

            if (arrData2.length < 5) {
                gagal++;
                continue;
            }

            const idx = arrData2[0];
            const deskripsi = arrData2[1];
            const waktu = arrData2[2];
            const nominal = arrData2[3];
            const jenis = arrData2[4];

            const idTransaksiBackup = `${idBackup}-${idx}`;

            await connection.execute(
                "INSERT INTO backup_transaksi (id, id_backup, tgl_jam, nominal, jenis, uraian) VALUES (?, ?, ?, ?, ?, ?)",
                [
                    idTransaksiBackup,
                    idBackup,
                    waktu,
                    nominal,
                    jenis,
                    deskripsi
                ]
            );

            berhasil++;
        }

        await connection.commit();

        return res.status(200).json({
            kode: "01",
            status: "Proses Backup Berhasil dengan Rincian",
            berhasil: berhasil,
            gagal: gagal
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error("===== ERROR BACKUP NODEJS =====");
        console.error("Code:", error.code);
        console.error("Message:", error.message);
        console.error("SQL Message:", error.sqlMessage);
        console.error("SQL:", error.sql);
        console.error("===============================");

        return res.status(500).json({
            kode: "99",
            status: "Server Error",
            error_code: error.code,
            message: error.message,
            sql_message: error.sqlMessage
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.listen(port, () => {
    console.log(`API Berjalan di Port: ${port}`);
});