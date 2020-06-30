const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
var CryptoJS = require("crypto-js");
const { Client } = require('pg');

const app = express();
app.use(bodyParser.json());

//Connection to DB
const connectionString = 'postgres://nikolai:Naramig30@localhost:5432/eshop';
const client = new Client({
    connectionString: connectionString
});
client.connect();


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
      throw new Error('Login or Password is incorrect');
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



app.get('/getCategories', async (req, res) => {
  try{
    var categories = await client.query('SELECT * FROM "Category"');
    res.status(200).send(categories.rows);
  }catch(err){
    res.status(200).send({error: err.message});
  }
})

app.post('/createProduct', async (req, res) => {
  try{
    var category_id = req.body.category_id;
    var name = req.body.name;

    await client.query("INSERT INTO \"Product\" (name, category_id) VALUES ( $1, $2)", [name, category_id]);
    await client.query("UPDATE \"Category\" SET category_count = category_count + 1 WHERE id = $1", [category_id]);
    res.status(200).send("Inserted");
  }catch(err){
    res.status(400).send({error: err.message});
  }
})

app.post('/deleteProduct', async (req, res) => {
  try{
    var id = req.body.id;
    var category_id;

    var product = await client.query("SELECT * FROM \"Product\" WHERE id = $1", [id]);
    if(product.rows.length == 0){
      throw new Error('Product Not Found');
    }
    category_id = product.rows[0].category_id;

    await client.query("DELETE FROM \"Favorite\" WHERE product_id = $1", [id]);
    await client.query("DELETE FROM \"Product\" WHERE id = $1", [id]);
    await client.query("UPDATE \"Category\" SET  category_count =  category_count - 1 WHERE id = $1", [category_id]);
    res.status(200).send("Product Deleted");
  }catch(err){
    res.status(400).send({error: err.message});
  }
})

app.get('/getProducts', async (req, res) => {
  try{
    var category_id = req.body.category_id;
    var productsList;
    if(category_id){
      var productsList = await client.query("SELECT * FROM \"Product\" WHERE category_id = $1",[req.body.category_id]);
    }else{
      var productsList = await client.query("SELECT * FROM \"Product\"");
    }
    res.status(200).send(productsList.rows);
  }catch(err){
    res.status(400).send({error: err.message});
  }
})


async function CheckKey(key) {
  var userId = await client.query("SELECT \"User\".id FROM \"Session\" " +
               " INNER JOIN \"User\" ON \"User\".id = \"Session\".user_id " + 
               " WHERE \"Session\".key = $1 AND \"Session\".creation_date + interval '10 minutes' >= now()",
               [key.toString()]);
  return userId;
}

app.post('/addToFavorites', async(req, res) =>{
  try{
  var product_id = req.body.product_id;
  var key = req.body.session_key;  
  var userId = await CheckKey(key.toString());

  if(userId.err)
    throw err;
  else if(userId.rows.length == 0)
    throw new Error('Session expire or does not exist');

  await client.query("INSERT INTO \"Favorite\" (user_id, product_id) VALUES ($1, $2)", [userId.rows[0].id, product_id]);
  res.status(200).send("Inserted");
  }catch(err){
    res.status(400).send({error: err.message});
  }
})


app.get('/getFavorites', async(req, res) => {
  try{
  var key = req.body.session_key;
  var userId = await CheckKey(key.toString());

  if(userId.err)
    throw err;
  else if(userId.rows.length == 0)
    throw new Error('Session expire or does not exist');
  
  var listOfFavorites = await client.query("SELECT \"Product\".id, \"Product\".name" +
                                      " FROM \"Favorite\" "+
                                      " INNER JOIN \"Product\" ON \"Product\".id = \"Favorite\".product_id" +
                                      " INNER JOIN \"User\" ON \"User\".id = \"Favorite\".user_id "+
                                      " WHERE \"User\".id = $1",[userId.rows[0].id]);

  res.status(200).send(listOfFavorites.rows);

  }catch(err){
    res.status(400).send({error: err.message});
  }
})

app.listen(4000, function () {
    console.log('Server is running.. on Port 4000');
});
