import cors from "cors";
import dayjs from "dayjs";
import dotenv from "dotenv";
import express from "express";
import joi from "joi";
import { MongoClient } from "mongodb";

const app = express();

app.use(cors());
app.use(express.json());
dotenv.config();

const participantJoi = joi.object({
  name: joi.string().required(),
});

const PORT = 5000;

(async () => {
  const mongoClient = new MongoClient(process.env.DATABASE_URL);
  try {
    await mongoClient.connect();
    const db = mongoClient.db();
    console.log("MongoDB conectado!");

    app.post("/participants", async (req, res) => {
      const { name } = req.body;

      const { error } = participantJoi.validate({ name });
      if (error) {
        return res.status(422).send(error.details.map((detail) => detail.message));
      }

      const participant = await db.collection("participants").findOne({ name });
      if (participant) {
        return res.sendStatus(409);
      }

      const timestamp = Date.now();
      await db.collection("participants").insertOne({
        name,
        lastStatus: timestamp,
      });

      const mensagem = {
        from: name,
        to: "Todos",
        text: "entra na sala...",
        type: "status",
        time: dayjs(timestamp).format("HH:mm:ss"),
      };

      await db.collection("messages").insertOne(mensagem);

      res.sendStatus(201);
    });

    app.get("/participants", async (req, res) => {
        try {
          const participants = await db.collection("participants").find().toArray();
          res.send(participants);
        } catch (err) {
          res.status(500).send(err.message);
        }
      });
      

    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  } catch (err) {
    console.log(err.message);
  }
})();
