const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
var CryptoJS = require("crypto-js");
const { Client } = require('pg');

const app = express();
app.use(bodyParser.json());

//Connection to DB
const connectionString = 'postgres://nikolai:Naramig30@db:5432/eshop';
const client = new Client({
    connectionString: connectionString
});
client.connect();


app.post('/signup', function (req, res) {
  var login=req.body.login;
  var password=req.body.password;
  if(login, password){
  client.query("SELECT * FROM \"User\" WHERE login = $1", [login], function (err, result) {
      if (err) {
          res.status(400).send(err);
      }else{
        if(result.rows.length == 0){
          bcrypt.hash(password, 10, function(err, hash) {
            if(err)
              throw(err);
            client.query("INSERT INTO \"User\" (login, password) values($1, $2)", [login, hash], function (err, result) {
              if(err)
                res.send(err);
              else{
                  res.status(201).send(result);
              }
            });
            });

        }else{
          res.status(406).send("Change your name");
        }
    }
  });
}else{
  res.status(400).send();
}
})

app.post('/signin', function (req, res) {
  var login=req.body.login;
  var password=req.body.password;

  client.query("SELECT * FROM \"User\" WHERE login = $1", [login], function (err, result) {
      if (err) {
          res.status(400).send(err);
      }else if(result.rows.length == 0){
        res.status(406).send("User login / password is incorrect");
      }else{
        var user_id = result.rows[0].id;


          //Generate session_key
          bcrypt.compare(password, result.rows[0].password, function(err, result) {
              if(result == true){
                var salt = CryptoJS.lib.WordArray.random(128 / 8);
                  var key128Bits = CryptoJS.PBKDF2("Secret Passphrase", salt, {
                      keySize: 128 / 32
                    });

                client.query("INSERT INTO \"Session\" (key, user_id) values($1, $2)", [key128Bits.toString(), user_id], function(err, result) {
                  if(err)
                    throw(err);

                  res.status(201).send(JSON.parse("{\"session_key\": \"" + key128Bits + "\"}"));
                });

              }else{
                res.status(406).send("password is incorrect");
              }
          });

    }
  });
})

app.post('/testKey', function(req, res){
  var key = req.body.session_key;

  checkKey(key.toString(), function(err, result){
    if(err){
      res.send(err);
    }else if(result.rows.length == 0){
      res.send("Login first");
    }else{
      res.send(result.rows);
    }
  });
});

function checkKey(key, callback) {
  var resultt = -1;
  client.query("SELECT \"User\".id FROM \"Session\" INNER JOIN \"User\" ON \"User\".id = \"Session\".user_id WHERE \"Session\".key = $1 AND \"Session\".expire >= now()", [key], function (err, result) {
    return callback(err, result);
  });
}


app.get('/getCategories', function(req, res){
  client.query("SELECT * FROM \"Category\"", function(err, result){
    if(err)
      throw err;
    res.status(200).send(result.rows);
  });
});

app.post('/createProduct', function(req, res){
  var category_id = req.body.category_id;
  var name = req.body.name;
  client.query("INSERT INTO \"Product\" (name, category_id) VALUES ( $1, $2)", [name, category_id], function (err, result) {
      if(err){
        res.status(400).send(err);
      }
      else {
        client.query("UPDATE \"Category\" SET category_count = category_count + 1 WHERE id = $1", [category_id], function(err, result){
          if(err)
            throw err;
          res.status(201).send("Inserted");
        });
      }
  });
});

app.post('/deleteProduct', function(req, res){
  var id = req.body.id;
  var category_id = -1;
  client.query("SELECT * FROM \"Product\" WHERE id = $1", [id], function(err, result){
      if(err)
        throw err;
      category_id= result.rows[0].category_id;
        client.query("DELETE FROM \"Favorite\" WHERE product_id = $1", [id], function (err, result) {
          if(err)
            throw err;

          client.query("DELETE FROM \"Product\" WHERE id = $1", [id], function (err, result) {
            if(err){
              res.status(400).send(err);
            }else if(result.rowCount == 0){
              res.status(404).send("No product for id = " + id);
            }else{
              client.query("UPDATE \"Category\" SET  category_count =  category_count - 1 WHERE id = $1", [category_id], function(err, result){
                if(err)
                  throw err;
                  res.send("Deleted");
              });
           }
        });
    });
  });
});

app.get('/getProducts', function(req, res){
  if(req.body.category_id){
    client.query("SELECT * FROM \"Product\" WHERE category_id = $1",[req.body.category_id], function(err, result){
      if(err)
        throw err;
      res.status(200).send(result.rows);
    });
  }else{
    client.query("SELECT * FROM \"Product\"", function(err, result){
      if(err)
        throw err;
      res.status(200).send(result.rows);
    });
  }
});

app.post('/addToFavorites', function(req, res){
  var product_id = req.body.product_id;
  var key = req.body.session_key;

  checkKey(key.toString(), function(err, result){
    if(err){
      res.send(err);
    }else if(result.rows.length == 0){
      res.status(401).send("Login first");
    }else{
      client.query("INSERT INTO \"Favorite\" (user_id, product_id) VALUES ($1, $2)", [result.rows[0].id, product_id], function(err, result){
        if(err)
          throw err;
        res.status(201).send("Inserted");
      });
    }
  });
});

app.get('/getFavorites', function(req, res){
  var key = req.body.session_key;

  checkKey(key.toString(), function(err, result){
    if(err){
      res.send(err);
    }else if(result.rows.length == 0){
      res.send("Login first");
    }else{
      client.query("SELECT \"Product\".id, \"Product\".name" +
                    " FROM \"Favorite\" "+
                    " INNER JOIN \"Product\" ON \"Product\".id = \"Favorite\".product_id" +
                    " INNER JOIN \"User\" ON \"User\".id = \"Favorite\".user_id "+
                    " WHERE \"User\".id = $1",
                    [result.rows[0].id], function(err, result){
                      if(err)
                        throw err;
                    res.send(result.rows);
            });
    }
  });
});

app.listen(4000, function () {
    console.log('Server is running.. on Port 4000');
});
