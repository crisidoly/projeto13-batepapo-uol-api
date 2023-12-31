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
const messageJoi = joi.object({
    from: joi.string().required(),
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().required().valid("message", "private_message")
})

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
        console.log(req.headers)
        try {
          const participants = await db.collection("participants").find().toArray();
          res.send(participants);
        } catch (err) {
          res.status(500).send(err.message);
        }
      });

      app.get("/messages", async (req, res) => {
        const { user } = req.headers;
        const { limit } = req.query
        const numberLimit = Number(limit)

        if (limit !== undefined &&  (numberLimit <= 0 || isNaN(numberLimit))) 
        return res.sendStatus(422)

        try {
          const messages = await db
            .collection("messages")
            .find({
              $or: [{ from: user }, { to: { $in: ["Todos", user] } }, { type: "message" }],
            })
            .limit(limit === undefined ? 0 : numberLimit)
            .sort(({$natural:-1}))
            .toArray();
      
          res.send(messages);
        } catch (err) {
          res.status(500).send(err.message);
        }
      });
      
      app.post("/messages", async (req, res) => {
        try {
          const { user } = req.headers;
          const { to, text, type } = req.body;
      
          const validation = messageJoi.validate({ ...req.body, from: user });
          if (validation.error) {
            return res
              .status(422)
              .send(validation.error.details.map((detail) => detail.message));
          }
      
          const participant = await db.collection("participants").findOne({ name: user });
          if (!participant) {
            return res.sendStatus(422);
          }
      
          const message = {
            ...req.body,
            from: user,
            time: dayjs().format("HH:mm:ss"),
          };
          await db.collection("messages").insertOne(message);
      
          res.sendStatus(201);
        } catch (err) {
          res.status(500).send(err.message);
        }
      });
      
      app.post("/status", async (req, res) => {
        const { user } = req.headers;
      
        if (!user) return res.sendStatus(404);
      
        try {
          const result = await db
            .collection("participants")
            .updateOne({ name: user }, { $set: { lastStatus: Date.now() } });
      
          if (result.matchedCount === 0) return res.sendStatus(404);
          res.sendStatus(200);
        } catch (err) {
          res.status(500).send(err.message);
        }
      });
    
      setInterval(async () => {
        const dezSegundos = Date.now() - 10000;
      
        try {
          const inativos = await db
            .collection("participants")
            .find({ lastStatus: { $lt: dezSegundos } })
            .toArray();
      
          if (inativos.length > 0) {
            const mensagens = inativos.map((inativo) => {
              return {
                from: inativo.name,
                to: "Todos",
                text: "sai da sala...",
                type: "status",
                time: dayjs().format("HH:mm:ss"),
              };
            });
      
            await db.collection("messages").insertMany(mensagens);
            await db.collection("participants").deleteMany({ lastStatus: { $lt: dezSegundos } })
          }
        } catch (err) {
          console.log(err.message);
        }
      }, 15000);
      

    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  } catch (err) {
    console.log(err.message);
  }
})();
