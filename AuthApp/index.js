const express = require('express');
const { Client } = require('pg');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const CryptoJS = require("crypto-js");

const app = express()
app.use(bodyParser.json());

//Connection to DB
const connectionString = 'postgres://nikolai:Naramig30@localhost:5432/eshop';
const client = new Client({
    connectionString: connectionString
});
client.connect();

async function CheckKey(key) {
  var userId = await client.query("SELECT \"User\".id FROM \"Session\" " +
               " INNER JOIN \"User\" ON \"User\".id = \"Session\".user_id " + 
               " WHERE \"Session\".key = $1 AND \"Session\".creation_date + interval '10 minutes' >= now()",
               [key.toString()]);
  return userId;
}

app.post('/signup', async (req, res) => {
  try{
    var login=req.body.login;
    var password=req.body.password;
    if(!login || !password){
      throw new Error('Provide login and password correctly');
    }
    checkUsersLogin = await client.query("SELECT * FROM \"User\" WHERE login = $1", [login]);
    if(checkUsersLogin.rows.length != 0){
      throw new Error('Change your login');
    }
    var passwordHash = await bcrypt.hash(password, 10);
    await client.query("INSERT INTO \"User\" (login, password) values($1, $2)", [login, passwordHash]);
    res.status(201).send("Inserted");
  }catch(err){
    res.status(400).send({error: err.message});
  }
})

app.post('/signin', async (req, res) => {
  try{
    var login=req.body.login;
    var password=req.body.password;

    var userInfo = await client.query("SELECT * FROM \"User\" WHERE login = $1", [login]);
    if( userInfo.rows.length == 0){
      throw new Error('Login does not exist');
    }
    var userId =  userInfo.rows[0].id;
    var isPasswordCorrect = await bcrypt.compare(password, userInfo.rows[0].password);
    if(!isPasswordCorrect){
      throw new Error('Login or Password is incorrect');
    }
    var salt = CryptoJS.lib.WordArray.random(128 / 8);
    var key128Bits = CryptoJS.PBKDF2("Secret Passphrase", salt, { keySize: 128 / 32});

    await client.query("INSERT INTO \"Session\" (key, user_id) values($1, $2)", [key128Bits.toString(), userId]);

    res.status(200).send({session_key: key128Bits.toString()});
  }catch(err){
    res.status(400).send({error: err.message});
  }
})

app.post('/checkSession', async (req, res) => {
  try{
  var key = req.body.key;
  var userId = await CheckKey(key.toString());
  if(userId.err)
    throw err;
  else if(userId.rows.length == 0)
    throw new Error('Session expired or does not exist');
  res.send({id: userId.rows[0].id});
  }catch(err){
    res.status(400).send({error: err.message});
  }
})

app.listen(8082, () =>{
    console.log("Server is running on port 8082");
})

